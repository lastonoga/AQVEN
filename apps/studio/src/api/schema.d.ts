export interface paths {
    "/api/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ready */
        get: operations["ready"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Status */
        get: operations["status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/project": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Project */
        get: operations["project_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/project/research": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Research Budget */
        get: operations["research_budget_get"];
        /** Put Research Budget */
        put: operations["research_budget_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Files */
        get: operations["file_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/files/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get File */
        get: operations["file_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/raw/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Raw */
        get: operations["raw_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Flows */
        get: operations["flow_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Flow */
        get: operations["flow_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/spec": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Flow Spec */
        get: operations["flow_spec"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/ir": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Flow Ir */
        get: operations["flow_ir"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/schemas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Flow Schemas */
        get: operations["flow_schemas"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/run-scope": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Run Scope */
        post: operations["flow_run_scope"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/dataset-range": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Dataset Range */
        post: operations["flow_dataset_range"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/manual-range": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Manual Range */
        post: operations["flow_manual_range"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/nodes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Nodes */
        get: operations["flow_nodes"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/nodes/{node_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Node */
        get: operations["flow_node"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/nodes/{node_id}/display-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Node Display Preview */
        get: operations["flow_node_display_preview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/nodes/{node_id}/prompt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Prompt */
        get: operations["flow_node_prompt"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/flows/{flow_id}/nodes/{node_id}/prompt/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Prompt Of Node */
        post: operations["flow_node_prompt_preview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/prompts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Prompts */
        get: operations["prompt_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/types": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Types */
        get: operations["type_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/types/{type_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Type */
        get: operations["type_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Runs */
        get: operations["run_list"];
        put?: never;
        /** Start Run */
        post: operations["run_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{run_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Run */
        get: operations["run_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{run_id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Run Events */
        get: operations["run_events"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{run_id}/events/log": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Run Event Log */
        get: operations["run_event_log"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{run_id}/executions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Executions */
        get: operations["run_executions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{run_id}/executions/detail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Execution */
        get: operations["run_executions_detail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{run_id}/presentation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Present Run */
        post: operations["run_presentation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{run_id}/resume": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resume Run */
        post: operations["run_resume"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{run_id}/fork": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Fork Run */
        post: operations["run_fork"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{run_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Run */
        post: operations["run_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events/spec": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Server-sent stream of project changes: spec files and research
         * @description A text/event-stream that stays open and pushes a frame per spec change and per research fact: a series started, its progress at most once a second, a status change, a finding written, an experiment's files changed. It is not a schema document and a plain request to it never completes. Each frame carries one SpecEvent as data, its type as the event name and its seq as the id; resume with after_seq or Last-Event-ID. The JSON Schema of every event is at GET /api/schemas/events.
         */
        get: operations["spec_events"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Server-sent stream that follows several feeds over one connection
         * @description A text/event-stream that stays open and multiplexes the feeds named by repeated follow parameters, each written <feed>[:<key>][@<after_seq>]: spec for project changes, run:<run_id> for one run, chat:<session_id> for one chat session. A browser holds a handful of connections per server, so Studio follows everything a tab needs here instead of opening a stream per feed. Each frame carries one event of its feed as data and the followed name, without the cursor, as the event name. Frames carry no id: to resume, reconnect with each feed's last seq after @. A feed this server does not serve, or whose key names no run or session, ends quietly and the others go on. It is not a schema document; the per-feed streams stay available and the JSON Schema of every event is at GET /api/schemas/events.
         */
        get: operations["events_follow"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/schemas/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * JSON Schema of every event of the spec, run, chat and series channels
         * @description A schema document, not a stream: schemas.spec, schemas.run, schemas.chat and schemas.series map an event type to the JSON Schema of that event. The spec, run, chat and series arrays stay empty and exist only so the generated client can name each channel union. Live events arrive on GET /api/events/spec, GET /api/runs/{run_id}/events, GET /api/chat/sessions/{session_id}/events and GET /api/series/{series_id}/events.
         */
        get: operations["event_catalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/spec-schemas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * JSON Schema of every definition kind for the editor
         * @description The same schemas aqven schema writes to .aqven/schema/<kind>.schema.json. Each entry carries the schema of one kind and, for Node and Type, the schema of every variant under variants.
         */
        get: operations["spec_schema_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/spec-schemas/{kind}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * JSON Schema of one definition kind
         * @description An unknown kind fails validation of the path parameter and answers 422 REQUEST_INVALID; the known kinds are the values of SpecKind.
         */
        get: operations["spec_schema_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/blobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload Blob */
        post: operations["blob_upload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/blobs/{blob_id}/meta": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Blob Meta */
        get: operations["blob_meta"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/blobs/{blob_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Download Blob */
        get: operations["blob_download"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        /** Download Blob */
        head: operations["blob_head"];
        patch?: never;
        trace?: never;
    };
    "/api/settings/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Provider Keys */
        get: operations["provider_keys"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/secrets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Secrets */
        get: operations["secret_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/user": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Local User */
        get: operations["local_user_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/{scope}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Settings */
        get: operations["setting_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/{scope}/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Setting */
        get: operations["setting_get"];
        /** Put Setting */
        put: operations["setting_put"];
        post?: never;
        /** Delete Setting */
        delete: operations["setting_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Datasets */
        get: operations["dataset_list"];
        put?: never;
        /** Save Dataset */
        post: operations["dataset_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets/{dataset_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Dataset */
        get: operations["dataset_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets/{dataset_id}/cases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Dataset Cases */
        get: operations["dataset_cases"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets/{dataset_id}/case-names": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Dataset Case Names */
        get: operations["dataset_case_names"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets/{dataset_id}/cases/{case_name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Dataset Case */
        get: operations["dataset_case_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets/{dataset_id}/cases/from-run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Draft Case From Run */
        post: operations["case_from_run"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets/draft": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Generate Dataset Draft */
        post: operations["dataset_draft"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets/import-csv/template": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Dataset Csv Template */
        get: operations["dataset_csv_template"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets/import-csv/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Dataset Csv */
        post: operations["dataset_csv_preview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/datasets/import-csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Import Dataset Csv */
        post: operations["dataset_csv_import"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/experiments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Experiments */
        get: operations["experiment_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/experiments/{experiment_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Experiment */
        get: operations["experiment_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/experiments/{experiment_id}/arms/{arm_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Experiment Arm */
        get: operations["experiment_arm"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/experiments/{experiment_id}/launch-plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Plan Series */
        post: operations["series_launch_plan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/series": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Series */
        get: operations["series_list"];
        put?: never;
        /** Start Series */
        post: operations["series_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/series/{series_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Series */
        get: operations["series_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/series/{series_id}/cases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Series Cases */
        get: operations["series_cases"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/series/{series_id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Series Events */
        get: operations["series_events"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/series/{series_id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Approve Series */
        post: operations["series_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/series/{series_id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancel Series */
        post: operations["series_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/chat/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Chat Login Status */
        get: operations["chat_login_status"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/chat/models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Chat Model List */
        get: operations["chat_model_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/chat/backend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Chat Backend Get */
        get: operations["chat_backend_get"];
        /** Chat Backend Put */
        put: operations["chat_backend_put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/chat/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Chat Session List */
        get: operations["chat_session_list"];
        put?: never;
        /** Chat Session Create */
        post: operations["chat_session_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/chat/sessions/{session_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Chat Session Get */
        get: operations["chat_session_get"];
        put?: never;
        post?: never;
        /** Chat Session Close */
        delete: operations["chat_session_close"];
        options?: never;
        head?: never;
        /** Chat Session Settings */
        patch: operations["chat_session_settings"];
        trace?: never;
    };
    "/api/chat/sessions/{session_id}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Chat Message Send */
        post: operations["chat_message_send"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/chat/sessions/{session_id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Chat Events */
        get: operations["chat_events"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/chat/sessions/{session_id}/transcript": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Chat Transcript */
        get: operations["chat_transcript"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/chat/sessions/{session_id}/approvals/{approval_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Chat Approval Answer */
        post: operations["chat_approval_answer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/chat/sessions/{session_id}/interrupt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Chat Interrupt */
        post: operations["chat_interrupt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AbsoluteCodeRef: string;
        /** @enum {string} */
        ActorKind: "human" | "agent" | "fs" | "git" | "system";
        /** @enum {string} */
        AgentBackendKind: "claude" | "codex";
        /** AgentModel */
        AgentModel: {
            model: components["schemas"]["ModelText"];
            provider: components["schemas"]["ProviderText"];
        };
        /** AgentOutputSpec */
        AgentOutputSpec: {
            /** @default auto */
            mode: components["schemas"]["OutputModeSetting"];
            /**
             * Strict
             * @default true
             */
            strict: boolean;
            /**
             * Retries
             * @default 1
             */
            retries: number;
            /** @default retry */
            on_error: components["schemas"]["OutcomePolicy"];
            /** @default fail */
            on_refusal: components["schemas"]["OutcomePolicy"];
            /** @default fail */
            on_truncated: components["schemas"]["OutcomePolicy"];
        };
        /** AgentRefView */
        AgentRefView: {
            /** Agent Id */
            agent_id: string;
            /** Model */
            model: string;
        };
        /** AgentSpec */
        AgentSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Agent";
            /** Description */
            description: string;
            model: components["schemas"]["ModelField"];
            /** Fallback Models */
            fallback_models?: components["schemas"]["ModelField"][] | null;
            settings?: components["schemas"]["ModelSettingsSpec"] | null;
            output?: components["schemas"]["AgentOutputSpec"];
            /** Instructions */
            instructions?: string | null;
            /** Tools */
            tools?: string[] | null;
            /** Mcp Servers */
            mcp_servers?: string[] | null;
            /** Subagents */
            subagents?: components["schemas"]["SubagentSpec"][] | null;
            approval?: components["schemas"]["ToolApprovalSpec"] | null;
            limits?: components["schemas"]["Limits"] | null;
        };
        /** AllowedSetMember */
        AllowedSetMember: {
            /** Value */
            value: string;
            /** Label */
            label: string | null;
        };
        /** @enum {string} */
        AllowedSetMode: "dynamic" | "none";
        /** AllowedSetSpec */
        AllowedSetSpec: {
            /** Type */
            type: string;
            /** From */
            from: string;
            /** Labels From */
            labels_from?: string | null;
        };
        /** ApiError */
        ApiError: {
            /**
             * Ok
             * @default false
             * @constant
             */
            ok: false;
            /** Op */
            op: string;
            code: components["schemas"]["ApiErrorCode"];
            /** Message */
            message: string;
            /**
             * Problems
             * @default []
             */
            problems: components["schemas"]["Problem"][];
            /**
             * Candidates
             * @default []
             */
            candidates: components["schemas"]["JsonValue"][];
            conflict?: components["schemas"]["JsonObject"] | null;
            /** Retry After Ms */
            retry_after_ms?: number | null;
        };
        /** @enum {string} */
        ApiErrorCode: "NOT_FOUND" | "REQUEST_INVALID" | "INPUT_INVALID" | "CONTEXT_MISSING" | "BLOCKING_PROBLEMS" | "VIEW_TOO_BROAD" | "STALE_FILE" | "FILE_VANISHED" | "FILE_EXISTS" | "WAIT_ATTEMPT_STALE" | "TREE_DIRTY" | "INDEX_STALE" | "NOT_RUNNABLE" | "DIRTY_WORKTREE" | "ALREADY_RESUMED" | "NOT_WAITING" | "RUN_TIMED_OUT" | "RUN_STATE_CONFLICT" | "SERIES_STATE_CONFLICT" | "CHAT_STATE_CONFLICT" | "PROMPT_IS_CODE" | "LOCK_BUSY" | "UNAUTHORIZED" | "FORBIDDEN" | "HOST_NOT_ALLOWED" | "METHOD_NOT_ALLOWED" | "INTERNAL";
        /** @enum {string} */
        ApprovalDecision: "allow" | "deny";
        /**
         * ApprovalReason
         * @enum {string}
         */
        ApprovalReason: "cap_above_project" | "spend_near_cap";
        /** @enum {string} */
        ApprovalResolver: "user" | "interrupt" | "session_closed";
        /** ArmFlowView */
        ArmFlowView: {
            /** Experiment Id */
            experiment_id: string;
            /** Arm Id */
            arm_id: string;
            /** Flow Id */
            flow_id: string;
            /** Description */
            description: string | null;
            /** Order */
            order: string[];
            /** Nodes */
            nodes: components["schemas"]["NodeSummary"][];
            schemas: components["schemas"]["FlowSchemas"];
            /** Prompts */
            prompts: {
                [key: string]: components["schemas"]["PromptDetail"];
            };
        };
        /** ArmStepView */
        ArmStepView: {
            /** Node Id */
            node_id: string;
            kind: components["schemas"]["NodeKind"];
            agent: components["schemas"]["AgentRefView"] | null;
            /** Description */
            description: string;
        };
        /** ArmView */
        ArmView: {
            /** Arm Id */
            arm_id: string;
            /** Description */
            description: string;
            /** Steps */
            steps: components["schemas"]["ArmStepView"][];
        };
        /** @enum {string} */
        AssigneeSource: "setting" | "os_user";
        /** AssignmentView */
        AssignmentView: {
            /** Node Id */
            node_id: string;
            agent: components["schemas"]["AgentRefView"];
            /** Overridden */
            overridden: boolean;
        };
        /** Attempt */
        Attempt: {
            /** Attempt */
            attempt: number;
            cause: components["schemas"]["AttemptCause"] | null;
            action: components["schemas"]["AttemptAction"];
            /** Model */
            model: string | null;
            /** Latency Ms */
            latency_ms: number | null;
            /** Cost Usd */
            cost_usd: string;
            /** Tokens In */
            tokens_in: number;
            /** Tokens Out */
            tokens_out: number;
            prompt_ref: components["schemas"]["ValueRef"] | null;
            response_ref: components["schemas"]["ValueRef"] | null;
        };
        /** @enum {string} */
        AttemptAction: "retry" | "repair" | "fallback" | "none";
        /** AttemptCause */
        AttemptCause: {
            kind: components["schemas"]["AttemptCauseKind"];
            /** Message */
            message: string;
            /** Schema Errors */
            schema_errors: components["schemas"]["Problem"][];
            /** Code */
            code?: string | null;
            /** Hint */
            hint?: string | null;
            details?: components["schemas"]["ModelErrorDetails"] | null;
        };
        /** @enum {string} */
        AttemptCauseKind: "rate_limited" | "schema_invalid" | "truncated" | "refusal" | "provider_error" | "budget_exceeded" | "cassette_miss" | "invalid_json" | "no_structured_output" | "feature_unsupported";
        /** AttemptFinishedEvent */
        AttemptFinishedEvent: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Series Id */
            series_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "attempt_finished";
            /** Attempt Id */
            attempt_id: string;
            /** Ordinal */
            ordinal: number;
            /** Variant Id */
            variant_id: string;
            /** Case Name */
            case_name: string;
            /** Repeat */
            repeat: number;
            /** Run Id */
            run_id: string;
            outcome: components["schemas"]["OutcomeClass"];
            /** Passed */
            passed: boolean | null;
            /** Cost Usd */
            cost_usd: string;
            /** Done */
            done: number;
            /** Total */
            total: number;
            /** Spend Usd */
            spend_usd: string;
        };
        /**
         * AttemptOutcome
         * @enum {string}
         */
        AttemptOutcome: "passed" | "failed" | "error" | "waiting" | "running";
        /** AttemptView */
        AttemptView: {
            /** Run Id */
            run_id: string;
            /** Variant Id */
            variant_id: string;
            /** Repeat */
            repeat: number;
            /** Passed */
            passed: boolean;
            outcome: components["schemas"]["AttemptOutcome"];
            /** Failed Checks */
            failed_checks: string[];
            /** Usd */
            usd: string;
            /** Latency Ms */
            latency_ms: number;
            /** Error */
            error?: string | null;
        };
        /** BlobMeta */
        BlobMeta: {
            /** Blob Id */
            blob_id: string;
            /** Sha256 */
            sha256: string;
            /** Size Bytes */
            size_bytes: number;
            /** Media Type */
            media_type: string;
            /** Name */
            name: string | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
        };
        /** BlobUploaded */
        BlobUploaded: {
            /** Blob Id */
            blob_id: string;
            /** Sha256 */
            sha256: string;
            /** Size Bytes */
            size_bytes: number;
            /** Media Type */
            media_type: string;
        };
        /** BlobValue */
        BlobValue: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "blob";
            /** Blob Id */
            blob_id: string;
            /** Sha256 */
            sha256: string;
            /** Size Bytes */
            size_bytes: number;
            /** Media Type */
            media_type: string;
            /** Preview */
            preview: string;
            /** Truncated */
            truncated: boolean;
        };
        /** Body_blob_upload */
        Body_blob_upload: {
            /** File */
            file: string;
        };
        /** Body_dataset_csv_import */
        Body_dataset_csv_import: {
            /** Dataset Id */
            dataset_id: string;
            /** Flow Id */
            flow_id: string;
            /** File */
            file: string;
        };
        /** Body_dataset_csv_preview */
        Body_dataset_csv_preview: {
            /** Dataset Id */
            dataset_id: string;
            /** Flow Id */
            flow_id: string;
            /** File */
            file: string;
        };
        /** BoundField */
        BoundField: {
            /** Name */
            name: string;
            /** Type */
            type: string;
            /** Description */
            description: string;
            /** Maxlength */
            maxLength?: number | null;
            /** Maxitems */
            maxItems?: number | null;
            /** Minimum */
            minimum?: number | null;
            /** Maximum */
            maximum?: number | null;
            /** Pattern */
            pattern?: string | null;
            /** Enum */
            enum?: string[] | null;
            /** From */
            from: string;
            /** Value Type */
            value_type?: string | null;
        };
        /** BuiltinEvaluator */
        BuiltinEvaluator: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "builtin";
            use: components["schemas"]["PolicyName"];
            params?: components["schemas"]["JsonParams"];
        };
        /** BuiltinPolicy */
        BuiltinPolicy: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "builtin";
            use: components["schemas"]["PolicyName"];
            params?: components["schemas"]["JsonParams"];
        };
        /** CallNodeSpec */
        CallNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "call";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** Flow */
            flow: string;
            /** In */
            in?: components["schemas"]["FieldBinding"][];
        };
        /** @enum {string} */
        CallOutcome: "ok" | "refusal" | "truncated" | "error";
        /** CancelRequest */
        CancelRequest: {
            /** Reason */
            reason: string;
        };
        /** CancelResult */
        CancelResult: {
            status: components["schemas"]["RunStatus"];
        };
        /** @enum {string} */
        CapSource: "override" | "project" | "default";
        /** CaseDraft */
        CaseDraft: {
            /** Dataset Id */
            dataset_id: string;
            case: components["schemas"]["DatasetCase"];
            /** Yaml */
            yaml: string;
        };
        /** CaseFromRunRequest */
        CaseFromRunRequest: {
            /** Run Id */
            run_id: string;
            /** Name */
            name?: string | null;
        };
        /** CaseSelectionView */
        CaseSelectionView: {
            /** Dataset Id */
            dataset_id: string;
            /** Flow Id */
            flow_id: string | null;
            /** Tags */
            tags: {
                [key: string]: string;
            };
            /** Selected */
            selected: number;
            /** Total */
            total: number;
            /** Splits */
            splits: {
                [key: string]: number;
            };
        };
        /**
         * CellVerdict
         * @enum {string}
         */
        CellVerdict: "pass" | "fail" | "unclear" | "reference" | "none";
        /** @enum {string} */
        ChangeKind: "added" | "modified" | "deleted";
        /** ChatApprovalReply */
        ChatApprovalReply: {
            decision: components["schemas"]["ApprovalDecision"];
            /** Message */
            message?: string | null;
            /** Answers */
            answers?: {
                [key: string]: string;
            } | null;
        };
        /** ChatApprovalRequested */
        ChatApprovalRequested: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_approval_requested";
            /** Approval Id */
            approval_id: string;
            /** Tool Call Id */
            tool_call_id: string;
            /** Tool Name */
            tool_name: string;
            input: components["schemas"]["JsonObject"];
            /** Reason */
            reason: string | null;
        };
        /** ChatApprovalResolved */
        ChatApprovalResolved: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_approval_resolved";
            /** Approval Id */
            approval_id: string;
            decision: components["schemas"]["ApprovalDecision"];
            resolved_by: components["schemas"]["ApprovalResolver"];
        };
        /** ChatBackendChoice */
        ChatBackendChoice: {
            backend: components["schemas"]["AgentBackendKind"];
        };
        /** ChatBackendWrite */
        ChatBackendWrite: {
            backend: components["schemas"]["AgentBackendKind"];
        };
        /** ChatCommand */
        ChatCommand: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_command";
            /** Tool Call Id */
            tool_call_id: string;
            /** Command */
            command: string;
            /** Description */
            description: string | null;
            /** Exit Code */
            exit_code: number | null;
            /** Output Preview */
            output_preview: string;
            /** Truncated */
            truncated: boolean;
        };
        /** @enum {string} */
        ChatDelivery: "next_step" | "after_turn";
        /** @enum {string} */
        ChatEffort: "low" | "medium" | "high" | "xhigh" | "max";
        /** @enum {string} */
        ChatErrorCode: "auth_required" | "rate_limited" | "billing" | "backend_unavailable" | "invalid_request" | "internal";
        /** ChatErrorRaised */
        ChatErrorRaised: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_error";
            code: components["schemas"]["ChatErrorCode"];
            /** Message */
            message: string;
            /** Retryable */
            retryable: boolean;
        };
        ChatEvent: components["schemas"]["ChatTurnStarted"] | components["schemas"]["ChatMessageQueued"] | components["schemas"]["ChatMessageDelivered"] | components["schemas"]["ChatTextDelta"] | components["schemas"]["ChatReasoningDelta"] | components["schemas"]["ChatToolCallStarted"] | components["schemas"]["ChatToolCallArgsDelta"] | components["schemas"]["ChatToolCallFinished"] | components["schemas"]["ChatFileEdit"] | components["schemas"]["ChatCommand"] | components["schemas"]["ChatApprovalRequested"] | components["schemas"]["ChatApprovalResolved"] | components["schemas"]["ChatStatus"] | components["schemas"]["ChatUsageReported"] | components["schemas"]["ChatErrorRaised"] | components["schemas"]["ChatTurnFinished"];
        /** @enum {string} */
        ChatFileChange: "added" | "modified" | "deleted";
        /** ChatFileEdit */
        ChatFileEdit: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_file_edit";
            /** Tool Call Id */
            tool_call_id: string;
            /** Path */
            path: string;
            change: components["schemas"]["ChatFileChange"];
            /** Diff */
            diff: string;
        };
        /** @enum {string} */
        ChatFinishReason: "server_restarted" | "server_stopped" | "agent_lost" | "stop_forced";
        /** ChatMessageDelivered */
        ChatMessageDelivered: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_message_delivered";
            /** Client Op Id */
            client_op_id: string;
        };
        /** ChatMessageQueued */
        ChatMessageQueued: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_message_queued";
            /** Client Op Id */
            client_op_id: string;
            /** Text */
            text: string;
            delivery: components["schemas"]["ChatDelivery"];
        };
        /** ChatMessageRequest */
        ChatMessageRequest: {
            /** Text */
            text: string;
            /** Client Op Id */
            client_op_id: string;
        };
        /** ChatModel */
        ChatModel: {
            /** Id */
            id: string;
            /** Display Name */
            display_name: string;
            /** Description */
            description: string | null;
            /**
             * Is Default
             * @default false
             */
            is_default: boolean;
            /**
             * Efforts
             * @default []
             */
            efforts: components["schemas"]["ChatModelEffort"][];
            default_effort?: components["schemas"]["ChatEffort"] | null;
        };
        /** ChatModelCatalog */
        ChatModelCatalog: {
            backend: components["schemas"]["AgentBackendKind"];
            /** Models */
            models: components["schemas"]["ChatModel"][];
            /** Accepts Any Model */
            accepts_any_model: boolean;
            /** Detail */
            detail?: string | null;
        };
        /** ChatModelEffort */
        ChatModelEffort: {
            effort: components["schemas"]["ChatEffort"];
            /** Description */
            description: string | null;
        };
        /** @enum {string} */
        ChatPermissionMode: "default" | "accept_edits" | "plan" | "trust";
        /** ChatReasoningDelta */
        ChatReasoningDelta: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_reasoning_delta";
            /** Message Id */
            message_id: string;
            /** Part Index */
            part_index: number;
            /** Delta */
            delta: string;
        };
        /** ChatSession */
        ChatSession: {
            /** Session Id */
            session_id: string;
            backend: components["schemas"]["AgentBackendKind"];
            /** Project Root */
            project_root: string;
            /** Flow Id */
            flow_id: string | null;
            /** Model */
            model: string | null;
            effort?: components["schemas"]["ChatEffort"] | null;
            permission_mode: components["schemas"]["ChatPermissionMode"];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Last Seq */
            last_seq: number;
        };
        /** ChatSessionCreate */
        ChatSessionCreate: {
            /** Flow Id */
            flow_id?: string | null;
            /** Model */
            model?: string | null;
            effort?: components["schemas"]["ChatEffort"] | null;
            permission_mode?: components["schemas"]["ChatPermissionMode"] | null;
            /** Resume Session Id */
            resume_session_id?: string | null;
        };
        /** ChatSessionSettings */
        ChatSessionSettings: {
            /** Model */
            model?: string | null;
            effort?: components["schemas"]["ChatEffort"] | null;
            permission_mode?: components["schemas"]["ChatPermissionMode"] | null;
        };
        /** @enum {string} */
        ChatState: "idle" | "thinking" | "streaming" | "running_tool" | "waiting_approval" | "interrupting";
        /** ChatStatus */
        ChatStatus: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_status";
            state: components["schemas"]["ChatState"];
        };
        /** @enum {string} */
        ChatStopReason: "end_turn" | "interrupted" | "max_turns" | "error";
        /** ChatTextDelta */
        ChatTextDelta: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_text_delta";
            /** Message Id */
            message_id: string;
            /** Part Index */
            part_index: number;
            /** Delta */
            delta: string;
        };
        /** ChatToolCallArgsDelta */
        ChatToolCallArgsDelta: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_tool_call_args_delta";
            /** Tool Call Id */
            tool_call_id: string;
            /** Delta */
            delta: string;
        };
        /** ChatToolCallFinished */
        ChatToolCallFinished: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_tool_call_finished";
            /** Tool Call Id */
            tool_call_id: string;
            status: components["schemas"]["ChatToolStatus"];
            input: components["schemas"]["JsonObject"];
            /** Result Preview */
            result_preview: string | null;
            /** Truncated */
            truncated: boolean;
        };
        /** ChatToolCallStarted */
        ChatToolCallStarted: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_tool_call_started";
            /** Message Id */
            message_id: string;
            /** Tool Call Id */
            tool_call_id: string;
            /** Tool Name */
            tool_name: string;
            /** Mcp Server */
            mcp_server: string | null;
        };
        /** @enum {string} */
        ChatToolStatus: "ok" | "error" | "denied" | "interrupted";
        /** ChatTranscriptPage */
        ChatTranscriptPage: {
            /** Session Id */
            session_id: string;
            /** Turns */
            turns: components["schemas"]["ChatTranscriptTurn"][];
            /** Carry */
            carry: components["schemas"]["ChatEvent"][];
            /** Last Seq */
            last_seq: number;
            /** Before Seq */
            before_seq: number | null;
        };
        /** ChatTranscriptTurn */
        ChatTranscriptTurn: {
            /** First Seq */
            first_seq: number;
            /** Last Seq */
            last_seq: number;
            /** Turn Id */
            turn_id: string | null;
            /** Events */
            events: components["schemas"]["ChatEvent"][];
        };
        /** ChatTurnAccepted */
        ChatTurnAccepted: {
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string;
        };
        /** ChatTurnFinished */
        ChatTurnFinished: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_turn_finished";
            stop_reason: components["schemas"]["ChatStopReason"];
            /** Duration Ms */
            duration_ms: number;
            usage: components["schemas"]["ChatUsage"] | null;
            /** @default claude */
            backend: components["schemas"]["AgentBackendKind"];
            /** Model */
            model?: string | null;
            reason?: components["schemas"]["ChatFinishReason"] | null;
        };
        /** @enum {string} */
        ChatTurnOrigin: "user" | "continuation";
        /** ChatTurnStarted */
        ChatTurnStarted: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_turn_started";
            /** Client Op Id */
            client_op_id: string;
            /** Text */
            text: string;
            /** @default claude */
            backend: components["schemas"]["AgentBackendKind"];
            /** Model */
            model?: string | null;
            /** @default user */
            origin: components["schemas"]["ChatTurnOrigin"];
        };
        /** ChatUsage */
        ChatUsage: {
            /** Model */
            model: string | null;
            /** Tokens In */
            tokens_in: number;
            /** Tokens Out */
            tokens_out: number;
            /**
             * Thinking Tokens
             * @default 0
             */
            thinking_tokens: number;
            /** Cache Read Tokens */
            cache_read_tokens: number;
            /** Cache Write Tokens */
            cache_write_tokens: number;
            /** Cost Usd */
            cost_usd: string | null;
        };
        /** ChatUsageReported */
        ChatUsageReported: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Session Id */
            session_id: string;
            /** Turn Id */
            turn_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "chat_usage";
            /** Message Id */
            message_id?: string | null;
            usage: components["schemas"]["ChatUsage"];
        };
        /** CheckOutcome */
        CheckOutcome: {
            /** Check */
            check: string;
            on_fail: components["schemas"]["OnFail"];
            /** Passed */
            passed: boolean;
            /** Feedback */
            feedback: string | null;
            /** Attempt */
            attempt: number;
        };
        /** CheckSourceView */
        CheckSourceView: {
            /**
             * Kind
             * @enum {string}
             */
            kind: "builtin" | "code" | "judge";
            /** Use */
            use?: string | null;
            /**
             * Fields
             * @default []
             */
            fields: string[];
            /** Ref */
            ref?: string | null;
            /** Inference */
            inference?: string | null;
            agent?: components["schemas"]["AgentRefView"] | null;
            /** Validated By */
            validated_by?: string | null;
        };
        /** CheckSpec */
        CheckSpec: {
            /** Use */
            use?: string | null;
            /** Run */
            run?: string | null;
            /** Inference */
            inference?: string | null;
            /** Agent */
            agent?: string | null;
            /** With */
            with?: {
                [key: string]: components["schemas"]["JsonValue"];
            } | null;
            on_fail: components["schemas"]["OnFail"];
            /** Threshold */
            threshold?: number | null;
        };
        /** CheckView */
        CheckView: {
            /** Check Id */
            check_id: string;
            kind: components["schemas"]["MetricKind"];
            source: components["schemas"]["CheckSourceView"];
        };
        /** CodeEvaluator */
        CodeEvaluator: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "code";
            run: components["schemas"]["AbsoluteCodeRef"];
            params?: components["schemas"]["JsonParams"];
        };
        /** @enum {string} */
        CodeFormat: "prefixed_ordinal" | "identity";
        /** CodeNodeSpec */
        CodeNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "code";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** Run */
            run: string;
            /** In */
            in?: components["schemas"]["InputField"][];
            /** Out */
            out: components["schemas"]["OutputField"][];
        };
        /** CodePolicy */
        CodePolicy: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "code";
            run: components["schemas"]["AbsoluteCodeRef"];
            params?: components["schemas"]["JsonParams"];
        };
        /** CodePrompt */
        CodePrompt: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "code";
            run: components["schemas"]["AbsoluteCodeRef"];
        };
        /** CodeToolSource */
        CodeToolSource: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "code";
            run: components["schemas"]["AbsoluteCodeRef"];
        };
        /** @enum {string} */
        CompileStatus: "ok" | "not_runnable" | "invalid" | "unreadable";
        /** CompiledAgent */
        CompiledAgent: {
            /** Agent Id */
            agent_id: string;
            /** Description */
            description: string;
            /** Models */
            models: components["schemas"]["AgentModel"][];
            settings?: components["schemas"]["ModelSettingsSpec"] | null;
            output?: components["schemas"]["CompiledAgentOutput"];
            /** File */
            file?: string | null;
            /** Instructions */
            instructions?: string | null;
            /**
             * Tools
             * @default []
             */
            tools: string[];
            /**
             * Mcp Servers
             * @default []
             */
            mcp_servers: string[];
            /**
             * Subagents
             * @default []
             */
            subagents: components["schemas"]["SubagentSpec"][];
            approval?: components["schemas"]["ToolApprovalSpec"] | null;
            limits?: components["schemas"]["Limits"] | null;
        };
        /** CompiledAgentOutput */
        CompiledAgentOutput: {
            /** @default tool */
            mode: components["schemas"]["StructuredMode"];
            /** @default auto */
            declared_mode: components["schemas"]["OutputModeSetting"];
            /** @default profile */
            mode_source: components["schemas"]["OutputModeSource"];
            /**
             * Mode Reason
             * @default Pydantic AI profile default
             */
            mode_reason: string;
            /** Instruction */
            instruction?: string | null;
            /**
             * Strict
             * @default true
             */
            strict: boolean;
            /**
             * Retries
             * @default 1
             */
            retries: number;
            /** @default retry */
            on_error: components["schemas"]["OutcomePolicy"];
            /** @default fail */
            on_refusal: components["schemas"]["OutcomePolicy"];
            /** @default fail */
            on_truncated: components["schemas"]["OutcomePolicy"];
        };
        /** CompiledAllowedSet */
        CompiledAllowedSet: {
            /** Type Id */
            type_id: string;
            source: components["schemas"]["RefText"];
            labels_from?: components["schemas"]["RefText"] | null;
        };
        CompiledBinding: components["schemas"]["RefBinding"] | components["schemas"]["LiteralBinding"];
        /** CompiledCallNode */
        CompiledCallNode: {
            /**
             * Inputs
             * @default []
             */
            inputs: components["schemas"]["CompiledBinding"][];
            input_schema: components["schemas"]["JsonSchema"];
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "call";
            /** Flow */
            flow: string;
        };
        /** CompiledCheck */
        CompiledCheck: {
            /** Name */
            name: string;
            evaluator: components["schemas"]["CompiledEvaluator"];
            on_fail: components["schemas"]["OnFail"];
            /** Threshold */
            threshold?: number | null;
        };
        /** CompiledCodeNode */
        CompiledCodeNode: {
            /**
             * Inputs
             * @default []
             */
            inputs: components["schemas"]["CompiledBinding"][];
            input_schema: components["schemas"]["JsonSchema"];
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "code";
            run: components["schemas"]["AbsoluteCodeRef"];
            /**
             * Input Fields
             * @default []
             */
            input_fields: components["schemas"]["FieldIr"][];
            /** Output Fields */
            output_fields: components["schemas"]["FieldIr"][];
            /**
             * Dynamic Outputs
             * @default []
             */
            dynamic_outputs: components["schemas"]["DynamicOutput"][];
        };
        /** CompiledDisplayFormatter */
        CompiledDisplayFormatter: {
            run?: components["schemas"]["AbsoluteCodeRef"] | null;
            /** Template */
            template?: string | null;
            /** Variables */
            variables?: {
                [key: string]: components["schemas"]["RefText"];
            };
        };
        CompiledEvaluator: components["schemas"]["BuiltinEvaluator"] | components["schemas"]["CodeEvaluator"] | components["schemas"]["JudgeEvaluator"];
        /** CompiledFlow */
        CompiledFlow: {
            /** Flow Id */
            flow_id: string;
            /** Description */
            description: string;
            input_type: components["schemas"]["TypeRefText"];
            output_type: components["schemas"]["TypeRefText"];
            input_schema: components["schemas"]["JsonSchema"];
            output_schema: components["schemas"]["JsonSchema"];
            /** Returns */
            returns: components["schemas"]["CompiledBinding"][];
            /**
             * Context
             * @default []
             */
            context: components["schemas"]["RunContextKey"][];
            limits?: components["schemas"]["Limits"] | null;
            /** Order */
            order: string[];
            /** Nodes */
            nodes: {
                [key: string]: components["schemas"]["CompiledNode"];
            };
            /**
             * Requires
             * @default []
             */
            requires: components["schemas"]["ContractPredicate"][];
        };
        /** CompiledHumanNode */
        CompiledHumanNode: {
            /**
             * Inputs
             * @default []
             */
            inputs: components["schemas"]["CompiledBinding"][];
            input_schema: components["schemas"]["JsonSchema"];
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "human";
            /** Form */
            form: string;
            /** Assignee */
            assignee: string;
            /** Timeout Seconds */
            timeout_seconds: number;
            on_timeout: components["schemas"]["TimeoutPolicy"];
        };
        /** CompiledInference */
        CompiledInference: {
            /** Inference Id */
            inference_id: string;
            /** Description */
            description: string;
            /**
             * Input Fields
             * @default []
             */
            input_fields: components["schemas"]["FieldIr"][];
            /** Output Fields */
            output_fields: components["schemas"]["FieldIr"][];
            input_schema: components["schemas"]["JsonSchema"];
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * Dynamic Outputs
             * @default []
             */
            dynamic_outputs: components["schemas"]["DynamicOutput"][];
            prompt?: components["schemas"]["CompiledPrompt"] | null;
            /** Variants */
            variants?: {
                [key: string]: components["schemas"]["CompiledVariantSlot"];
            };
            /**
             * Allowed Sets
             * @default []
             */
            allowed_sets: components["schemas"]["CompiledAllowedSet"][];
            /**
             * Examples
             * @default []
             */
            examples: components["schemas"]["ExampleSpec"][];
            /**
             * Checks
             * @default []
             */
            checks: components["schemas"]["CompiledCheck"][];
            display?: components["schemas"]["CompiledInferenceDisplay"] | null;
            /** File */
            file?: string | null;
        };
        /** CompiledInferenceDisplay */
        CompiledInferenceDisplay: {
            input?: components["schemas"]["CompiledDisplayFormatter"] | null;
            output?: components["schemas"]["CompiledDisplayFormatter"] | null;
        };
        /** CompiledJobWait */
        CompiledJobWait: {
            poll: components["schemas"]["AbsoluteCodeRef"];
            /** Interval Seconds */
            interval_seconds: number;
            /** Timeout Seconds */
            timeout_seconds: number;
        };
        /** CompiledLlmNode */
        CompiledLlmNode: {
            /**
             * Inputs
             * @default []
             */
            inputs: components["schemas"]["CompiledBinding"][];
            input_schema: components["schemas"]["JsonSchema"];
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "llm";
            /** Agent */
            agent: string;
            /** Inference */
            inference: string;
            output_mode: components["schemas"]["OutputMode"];
        };
        /** CompiledLoopNode */
        CompiledLoopNode: {
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "loop";
            /** Body */
            body: string[];
            /** Init */
            init?: {
                [key: string]: components["schemas"]["CompiledBinding"][];
            };
            /** Max Iter */
            max_iter: number;
            /**
             * Stop
             * @default []
             */
            stop: components["schemas"]["CompiledPolicy"][];
            select: components["schemas"]["CompiledPolicy"];
            /** Outputs */
            outputs: components["schemas"]["RefBinding"][];
        };
        /** CompiledMapNode */
        CompiledMapNode: {
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "map";
            over: components["schemas"]["RefText"];
            /** Body */
            body: string;
            /** Concurrency */
            concurrency?: number | null;
            on_item_error: components["schemas"]["CompiledPolicy"];
            /** Outputs */
            outputs: components["schemas"]["RefBinding"][];
        };
        /** CompiledMcpServer */
        CompiledMcpServer: {
            /** Server Id */
            server_id: string;
            /** Description */
            description: string;
            /**
             * Transport
             * @default streamable_http
             * @constant
             */
            transport: "streamable_http";
            /** Url */
            url: string;
            /**
             * Headers
             * @default []
             */
            headers: components["schemas"]["SecretHeader"][];
            /** Schema Hash */
            schema_hash?: string | null;
        };
        /** CompiledNarrowNode */
        CompiledNarrowNode: {
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "narrow";
            source: components["schemas"]["RefText"];
            /** To */
            to: string;
        };
        CompiledNode: components["schemas"]["CompiledLlmNode"] | components["schemas"]["CompiledCodeNode"] | components["schemas"]["CompiledToolNode"] | components["schemas"]["CompiledHumanNode"] | components["schemas"]["CompiledParallelNode"] | components["schemas"]["CompiledMapNode"] | components["schemas"]["CompiledSwitchNode"] | components["schemas"]["CompiledLoopNode"] | components["schemas"]["CompiledCallNode"] | components["schemas"]["CompiledNarrowNode"];
        /** CompiledParallelNode */
        CompiledParallelNode: {
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "parallel";
            /** Branches */
            branches: {
                [key: string]: string;
            };
            join: components["schemas"]["CompiledPolicy"];
            /** Outputs */
            outputs: components["schemas"]["RefBinding"][];
        };
        CompiledPolicy: components["schemas"]["BuiltinPolicy"] | components["schemas"]["CodePolicy"];
        /** CompiledProject */
        CompiledProject: {
            /**
             * Ir Version
             * @default aqven/ir/v1
             * @constant
             */
            ir_version: "aqven/ir/v1";
            /** Package */
            package: string;
            /** Description */
            description: string;
            /**
             * Providers
             * @default []
             */
            providers: components["schemas"]["ProviderSpec"][];
            policies?: components["schemas"]["ProjectPolicies"] | null;
            limits?: components["schemas"]["Limits"] | null;
            /** Type Schemas */
            type_schemas?: {
                [key: string]: components["schemas"]["JsonSchema"];
            };
            /** Agents */
            agents?: {
                [key: string]: components["schemas"]["CompiledAgent"];
            };
            /** Inferences */
            inferences?: {
                [key: string]: components["schemas"]["CompiledInference"];
            };
            /** Tools */
            tools?: {
                [key: string]: components["schemas"]["CompiledTool"];
            };
            /** Mcp Servers */
            mcp_servers?: {
                [key: string]: components["schemas"]["CompiledMcpServer"];
            };
            /** Flows */
            flows?: {
                [key: string]: components["schemas"]["CompiledFlow"];
            };
        };
        CompiledPrompt: components["schemas"]["TemplatePrompt"] | components["schemas"]["CodePrompt"];
        /** CompiledSwitchCase */
        CompiledSwitchCase: {
            /** Node */
            node?: string | null;
            /**
             * Bindings
             * @default []
             */
            bindings: components["schemas"]["CompiledBinding"][];
        };
        /** CompiledSwitchNode */
        CompiledSwitchNode: {
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "switch";
            on: components["schemas"]["RefText"];
            /** Cases */
            cases: {
                [key: string]: components["schemas"]["CompiledSwitchCase"];
            };
            /** Output Names */
            output_names: components["schemas"]["FieldName"][];
        };
        /** CompiledTool */
        CompiledTool: {
            /** Tool Id */
            tool_id: string;
            /** Description */
            description: string;
            source: components["schemas"]["CompiledToolSource"];
            effect: components["schemas"]["Effect"];
            /**
             * Idempotency Key
             * @default []
             */
            idempotency_key: string[];
            /**
             * Secrets
             * @default []
             */
            secrets: components["schemas"]["SecretBinding"][];
            wait?: components["schemas"]["CompiledJobWait"] | null;
            /**
             * Input Fields
             * @default []
             */
            input_fields: components["schemas"]["FieldIr"][];
            /**
             * Output Fields
             * @default []
             */
            output_fields: components["schemas"]["FieldIr"][];
            input_schema?: components["schemas"]["JsonSchema"] | null;
            output_schema?: components["schemas"]["JsonSchema"] | null;
            /**
             * Dynamic Outputs
             * @default []
             */
            dynamic_outputs: components["schemas"]["DynamicOutput"][];
        };
        /** CompiledToolNode */
        CompiledToolNode: {
            /**
             * Inputs
             * @default []
             */
            inputs: components["schemas"]["CompiledBinding"][];
            input_schema: components["schemas"]["JsonSchema"];
            /** Node Id */
            node_id: string;
            /** Parent */
            parent?: string | null;
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            output_schema: components["schemas"]["JsonSchema"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "tool";
            /** Tool */
            tool: string;
        };
        CompiledToolSource: components["schemas"]["CodeToolSource"] | components["schemas"]["McpToolSource"];
        /** CompiledVariantSlot */
        CompiledVariantSlot: {
            on: components["schemas"]["RefText"];
            /** Cases */
            cases: {
                [key: string]: string;
            };
            /** Default */
            default?: string | null;
        };
        ContractPredicate: components["schemas"]["FamiliesDistinct"] | components["schemas"]["FamilyDisjointFromInput"] | components["schemas"]["FieldBefore"];
        /** Contrast */
        Contrast: {
            /** Metric */
            metric: string;
            /**
             * Role
             * @enum {string}
             */
            role: "primary" | "guardrail";
            /** Baseline */
            baseline: string;
            /** Candidate */
            candidate: string;
            direction: components["schemas"]["MetricDirection"];
            /** Margin */
            margin: number;
            /** Relative */
            relative: boolean;
            /** Margin Abs */
            margin_abs: number | null;
            difference: components["schemas"]["Estimate"];
            verdict: components["schemas"]["CellVerdict"];
        };
        /** @enum {string} */
        CostSource: "provider" | "prices" | "genai" | "unknown";
        Count: number;
        /** CsvColumn */
        CsvColumn: {
            /** Source */
            source: string;
            /** Target */
            target: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "name" | "input" | "context" | "metadata" | "expected_output" | "node_outputs" | "unmatched";
        };
        /** CsvImportPreview */
        CsvImportPreview: {
            /** Dataset Id */
            dataset_id: string;
            /** Flow Id */
            flow_id: string;
            /** Row Count */
            row_count: number;
            /** Columns */
            columns: components["schemas"]["CsvColumn"][];
            /** Rows */
            rows: components["schemas"]["CsvRowPreview"][];
            /** Media Count */
            media_count: number;
            /** Media */
            media: components["schemas"]["CsvMediaPreview"][];
            /** Problems */
            problems: string[];
            /** Ready */
            ready: boolean;
        };
        /** CsvMediaPreview */
        CsvMediaPreview: {
            /** Row */
            row: number;
            /** Field */
            field: string;
            /** Url */
            url: string;
            /** Media Type */
            media_type?: string | null;
            /** Size Bytes */
            size_bytes?: number | null;
            /** Ready */
            ready: boolean;
            /** Problem */
            problem?: string | null;
        };
        /** CsvNodePreview */
        CsvNodePreview: {
            /** Node Id */
            node_id: string;
            /** Ready */
            ready: boolean;
            /**
             * Missing
             * @default []
             */
            missing: string[];
        };
        /** CsvRowPreview */
        CsvRowPreview: {
            /** Number */
            number: number;
            /** Name */
            name: string;
            /** Ready */
            ready: boolean;
            /**
             * Problems
             * @default []
             */
            problems: string[];
            /**
             * Nodes
             * @default []
             */
            nodes: components["schemas"]["CsvNodePreview"][];
            /** Full Flow Ready */
            full_flow_ready?: boolean | null;
            /**
             * Full Flow Missing
             * @default []
             */
            full_flow_missing: string[];
        };
        /** CsvTemplate */
        CsvTemplate: {
            /** Flow Id */
            flow_id: string;
            /** Fields */
            fields: components["schemas"]["CsvTemplateField"][];
            /** Nodes */
            nodes: components["schemas"]["CsvTemplateNode"][];
            /** Csv */
            csv: string;
        };
        /** CsvTemplateField */
        CsvTemplateField: {
            /** Column */
            column: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "name" | "input" | "context" | "metadata" | "expected_output" | "node_outputs";
            /** Type */
            type: string;
            /** Required */
            required: boolean;
            /** Description */
            description?: string | null;
            /**
             * Example
             * @default
             */
            example: string;
        };
        /** CsvTemplateNode */
        CsvTemplateNode: {
            /** Node Id */
            node_id: string;
            /** Parent Node Id */
            parent_node_id?: string | null;
            /**
             * Input Columns
             * @default []
             */
            input_columns: string[];
            /**
             * Context Columns
             * @default []
             */
            context_columns: string[];
            /**
             * Fixture Columns
             * @default []
             */
            fixture_columns: string[];
        };
        /** DataPolicy */
        DataPolicy: {
            /** Allows Pii */
            allows_pii: boolean;
            /** Allows Sensitive */
            allows_sensitive: boolean;
            retention: components["schemas"]["Retention"];
        };
        /** DatasetCase */
        DatasetCase: {
            /** Name */
            name: string;
            inputs: components["schemas"]["JsonValue"];
            /** Context */
            context?: {
                [key: string]: components["schemas"]["JsonValue"];
            } | null;
            /** Node Outputs */
            node_outputs?: {
                [key: string]: components["schemas"]["JsonValue"];
            } | null;
            /** Metadata */
            metadata?: {
                [key: string]: components["schemas"]["JsonValue"];
            } | null;
            /** Tags */
            tags?: {
                [key: string]: string;
            } | null;
            expected_output?: components["schemas"]["JsonValue"];
        };
        /** DatasetCreateRequest */
        DatasetCreateRequest: {
            /** Dataset Id */
            dataset_id: string;
            /** Flow Id */
            flow_id: string;
            /** Cases */
            cases: components["schemas"]["DatasetCase"][];
        };
        /** DatasetDraftRequest */
        DatasetDraftRequest: {
            /** Flow Id */
            flow_id: string;
        };
        /** DatasetFile */
        DatasetFile: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Dataset";
            /** Flow */
            flow?: string | null;
            /** Cases */
            cases: components["schemas"]["DatasetCase"][];
        };
        /** DatasetRangePair */
        DatasetRangePair: {
            /** Start Node */
            start_node: string;
            /** End Node */
            end_node: string;
            /** Available */
            available: boolean;
            /** Missing */
            missing: components["schemas"]["MissingRangeData"][];
        };
        /** DatasetRangePreview */
        DatasetRangePreview: {
            /** Order */
            order: string[];
            /** Ranges */
            ranges: components["schemas"]["DatasetRangePair"][];
        };
        /** DatasetRangeRequest */
        DatasetRangeRequest: {
            /** Dataset Id */
            dataset_id: string;
            /** Case Names */
            case_names: string[];
        };
        /** DatasetSummary */
        DatasetSummary: {
            /** Dataset Id */
            dataset_id: string;
            /** Flow Id */
            flow_id?: string | null;
            /** Path */
            path: string;
            /** File Hash */
            file_hash: string;
            /** Cases */
            cases: number;
            /**
             * Splits
             * @default {}
             */
            splits: {
                [key: string]: number;
            };
        };
        /** DefaultOnTimeout */
        DefaultOnTimeout: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            policy: "default";
            value: components["schemas"]["JsonValue"];
        };
        /**
         * DegenerateReason
         * @enum {string}
         */
        DegenerateReason: "no_data" | "too_few_cases" | "too_few_attempts" | "no_discordance" | "uninformative" | "numeric";
        /** Diagnostic */
        Diagnostic: {
            code: components["schemas"]["DiagnosticCode"];
            severity: components["schemas"]["Severity"];
            /** File */
            file: string;
            /** Path */
            path: (string | number)[];
            /** Message */
            message: string;
            /** Rule */
            rule?: string | null;
            /** Line */
            line?: number | null;
            /** Column */
            column?: number | null;
            /** Hint */
            hint?: string | null;
        };
        /**
         * DiagnosticCode
         * @enum {string}
         */
        DiagnosticCode: "E_PROJECT_NOT_FOUND" | "E_YAML_SYNTAX" | "E_YAML_DUPLICATE_KEY" | "E_YAML_COMMENT" | "E_YAML_ANCHOR" | "E_YAML_TAG" | "E_YAML_DIRECTIVE" | "E_YAML_FLOW_STYLE" | "E_YAML_BLOCK_SCALAR" | "E_YAML_MULTI_DOCUMENT" | "E_YAML_NOT_MAPPING" | "E_API_VERSION" | "E_KIND_UNKNOWN" | "E_KIND_PATH_MISMATCH" | "E_UNKNOWN_KEY" | "E_SPEC_INVALID" | "E_NODE_KIND_UNSUPPORTED" | "E_BAD_NAME" | "E_ID_DUPLICATE" | "E_PACKAGE_MISMATCH" | "E_SOURCE_CONFLICT" | "E_BUILDER_FAILED" | "E_NODE_UNORDERED" | "E_ORPHAN_FILE" | "E_TYPE_REF_SYNTAX" | "E_TYPE_UNKNOWN" | "E_TYPE_CONSTRAINT_MISMATCH" | "E_TYPE_RECURSIVE" | "E_REF_SYNTAX" | "E_REF_MISSING" | "E_REF_SCOPE" | "E_CYCLE" | "E_BINDING_TYPE" | "E_INPUT_UNBOUND" | "E_INPUT_UNKNOWN" | "E_INFERENCE_UNKNOWN" | "E_AGENT_UNKNOWN" | "E_AGENT_RECURSION" | "E_TOOL_UNKNOWN" | "E_PROVIDER_UNKNOWN" | "E_MODALITY_UNSUPPORTED" | "E_TEXT_OUTPUT" | "E_SECRET_LITERAL" | "E_SECRET_REF_SYNTAX" | "E_PII_PROVIDER" | "E_PROMPT_MISSING" | "E_FRAGMENT_MISSING" | "E_PROMPT_SYNTAX" | "E_PROMPT_TAG_FORBIDDEN" | "E_PROMPT_FILTER_FORBIDDEN" | "E_PROMPT_MESSAGE_NESTED" | "E_PROMPT_VARIABLE_UNDECLARED" | "E_PROMPT_INPUT_UNUSED" | "E_PROMPT_OUTPUT_FORMAT" | "E_PROMPT_CASE_NOT_EXHAUSTIVE" | "E_PROMPT_MEDIA_RENDERED" | "E_VARIANT_MISSING" | "E_VARIANT_NOT_EXHAUSTIVE" | "E_EXAMPLE_INVALID" | "E_CHECK_PARAMS" | "E_POLICY_UNKNOWN" | "E_POLICY_PARAMS" | "E_CODE_REF_UNRESOLVED" | "E_CODE_SIGNATURE_MISMATCH" | "E_CODE_NOT_FOUND" | "E_ALIAS_UNKNOWN" | "E_ALIAS_RESERVED" | "E_ALIAS_OUTSIDE_PACKAGE" | "E_DOCSTRING" | "E_TOOL_IDEMPOTENCY" | "E_OUTPUT_UNBOUNDED" | "E_SWITCH_NOT_EXHAUSTIVE" | "E_SWITCH_ON_TYPE" | "E_HUMAN_FORM_TYPE" | "E_HUMAN_DEFAULT_INVALID" | "E_APPROVAL_TOOL" | "E_OUTCOME_FALLBACK" | "E_DYNAMIC_LIMITS" | "E_DYNAMIC_SOURCE" | "E_DYNAMIC_VALUE_TYPE" | "E_OPAQUE_ACCESS" | "E_NARROW_TARGET" | "E_ALLOWED_SET_TYPE" | "E_FLOW_UNKNOWN" | "E_CONTRACT_VIOLATION" | "E_FLOW_RECURSION" | "E_MCP_SERVER_UNKNOWN" | "E_DATASET_UNKNOWN" | "E_PROVIDER_EXTRA_MISSING" | "E_PROVIDER_NO_STREAMING" | "E_PROVIDER_FACTORY_INVALID" | "E_PROVIDER_ID_RESERVED" | "E_OUTPUT_MODE_UNSUPPORTED" | "E_TYPES_PACKAGE" | "E_SIM_NODE_FAILED" | "E_SIM_PROMPT_RENDER" | "E_SIM_OUTPUT_INVALID" | "E_SIM_RUN_FAILED" | "E_ARM_UNKNOWN" | "E_RANGE_INVALID" | "E_VARIANT_INVALID" | "E_METRIC_UNKNOWN" | "E_EXPERIMENT_UNKNOWN" | "E_DATASET_MISMATCH" | "E_CASE_DUPLICATE" | "E_CASES_EMPTY" | "E_EXPECTED_MISSING" | "E_CHECK_PATH_UNKNOWN" | "E_FINDING_TAMPERED" | "W_PROMPT_SHADOWED" | "W_GENERATED_STALE" | "W_OUTPUT_MODE_RESOLVED" | "W_SAMPLING_IGNORED" | "W_TYPES_SHADOWS_STDLIB" | "W_SIM_NODE_UNREACHED" | "W_PROMPT_VALUE_UNREADABLE" | "W_TOOL_ARG_UNREACHABLE" | "W_CONTEXT_KEY_UNUSED" | "W_PLAN_EXCEEDS_CASES" | "W_CHECK_CONTEXT_MISMATCH" | "W_JUDGE_INPUT_UNBOUND" | "W_FINDINGS_STALE";
        /** DiagnosticsChanged */
        DiagnosticsChanged: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Tree Hash */
            tree_hash: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "diagnostics_changed";
            /** Flow Id */
            flow_id: string;
            compile_status: components["schemas"]["CompileStatus"];
            problems: components["schemas"]["ProblemCounts"];
        };
        DisplayBadge: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "badge";
        } & {
            [key: string]: unknown;
        };
        /** DisplayCard */
        DisplayCard: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "card";
            /** Title */
            title: string;
            /** Description */
            description?: string | null;
            /** @default neutral */
            tone: components["schemas"]["DisplayTone"];
            /**
             * Children
             * @default []
             */
            children: components["schemas"]["DisplayElement"][];
        };
        /** DisplayDocument */
        DisplayDocument: {
            /**
             * Version
             * @default 1
             * @constant
             */
            version: 1;
            root: components["schemas"]["DisplaySection"];
        };
        DisplayElement: components["schemas"]["DisplaySection"] | components["schemas"]["DisplayText"] | components["schemas"]["DisplayField"] | components["schemas"]["DisplayList"] | components["schemas"]["DisplayCard"] | components["schemas"]["DisplayBadge"] | components["schemas"]["DisplayMedia"];
        DisplayField: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "field";
        } & {
            [key: string]: unknown;
        };
        /** DisplayFormatterSpec */
        DisplayFormatterSpec: {
            /** Run */
            run?: string | null;
            /** Template */
            template?: string | null;
            /** Variables */
            variables?: {
                [key: string]: components["schemas"]["DisplayVariableRef"];
            };
        };
        /** DisplayList */
        DisplayList: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "list";
            /** Title */
            title?: string | null;
            /**
             * Children
             * @default []
             */
            children: components["schemas"]["DisplayElement"][];
        };
        /** DisplayMedia */
        DisplayMedia: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "media";
            path: components["schemas"]["JsonPointer"];
            /** Alt */
            alt?: string | null;
        };
        /** DisplaySection */
        DisplaySection: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "section";
            /** Title */
            title?: string | null;
            /**
             * Children
             * @default []
             */
            children: components["schemas"]["DisplayElement"][];
        };
        /** @enum {string} */
        DisplaySide: "input" | "output";
        /** @enum {string} */
        DisplayStatus: "formatted" | "unavailable" | "error";
        DisplayText: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "text";
        } & {
            [key: string]: unknown;
        };
        /** @enum {string} */
        DisplayTone: "neutral" | "positive" | "warning" | "critical";
        DisplayVariableName: string;
        DisplayVariableRef: string;
        /** DynamicLimits */
        DynamicLimits: {
            /** Max Fields */
            max_fields: number;
            /** Max Depth */
            max_depth: number;
            /** Max Text Length */
            max_text_length: number;
            /** Max Items */
            max_items: number;
        };
        /** DynamicOutput */
        DynamicOutput: {
            name: components["schemas"]["FieldName"];
            schema_from: components["schemas"]["RefText"];
            limits: components["schemas"]["DynamicLimits"];
        };
        /** DynamicSlot */
        DynamicSlot: {
            /** Path */
            path: string[];
            /** Schema From */
            schema_from: string;
            limits: components["schemas"]["DynamicLimits"] | null;
        };
        /**
         * Effect
         * @enum {string}
         */
        Effect: "read" | "write" | "external";
        /** EnumType */
        EnumType: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Type";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "enum";
            /** Description */
            description: string;
            /** @default none */
            pii: components["schemas"]["PiiClass"];
            /** Values */
            values: components["schemas"]["EnumValue"][];
        };
        /** EnumValue */
        EnumValue: {
            /** Value */
            value: string;
            /** Description */
            description: string;
        };
        /** EscalateOnTimeout */
        EscalateOnTimeout: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            policy: "escalate";
            /** Assignee */
            assignee: string;
            /** Timeout Seconds */
            timeout_seconds: number;
        };
        /** Estimate */
        Estimate: {
            /** Value */
            value: number | null;
            /** Low */
            low: number | null;
            /** High */
            high: number | null;
            method: components["schemas"]["StatMethod"] | null;
            /** P Value */
            p_value?: number | null;
            /** P Adjusted */
            p_adjusted?: number | null;
            /** Cases */
            cases: number;
            /** Attempts */
            attempts: number;
            degenerate?: components["schemas"]["DegenerateReason"] | null;
        };
        /** EventCatalog */
        EventCatalog: {
            /**
             * Spec
             * @description Empty at runtime: the array exists so the generated client can name the channel union. The JSON Schema of every event lives in schemas.
             */
            spec: components["schemas"]["SpecEvent"][];
            /**
             * Run
             * @description Empty at runtime: the array exists so the generated client can name the channel union. The JSON Schema of every event lives in schemas.
             */
            run: components["schemas"]["RunEvent"][];
            /**
             * Chat
             * @description Empty at runtime: the array exists so the generated client can name the channel union. The JSON Schema of every event lives in schemas.
             */
            chat: components["schemas"]["ChatEvent"][];
            /**
             * Series
             * @description Empty at runtime: the array exists so the generated client can name the channel union. The JSON Schema of every event lives in schemas.
             */
            series: components["schemas"]["SeriesEvent"][];
            schemas: components["schemas"]["EventSchemas"];
        };
        /** EventSchemas */
        EventSchemas: {
            /** Dialect */
            dialect: string;
            /** Spec */
            spec: {
                [key: string]: components["schemas"]["JsonObject"];
            };
            /** Run */
            run: {
                [key: string]: components["schemas"]["JsonObject"];
            };
            /** Chat */
            chat: {
                [key: string]: components["schemas"]["JsonObject"];
            };
            /** Series */
            series: {
                [key: string]: components["schemas"]["JsonObject"];
            };
        };
        /** ExampleSpec */
        ExampleSpec: {
            /** Name */
            name: string;
            /** In */
            in: {
                [key: string]: components["schemas"]["JsonValue"];
            };
            /** Out */
            out: {
                [key: string]: components["schemas"]["JsonValue"];
            };
        };
        /** ExecutionAddress */
        ExecutionAddress: {
            /** Node Id */
            node_id: string;
            /** Branch Key */
            branch_key: string | null;
            /** Iteration */
            iteration: number | null;
            /** Item Index */
            item_index: number | null;
        };
        /** ExecutionDetail */
        ExecutionDetail: {
            address: components["schemas"]["ExecutionAddress"];
            kind: components["schemas"]["NodeKind"];
            status: components["schemas"]["ExecutionStatus"];
            /** Attempts Count */
            attempts_count: number;
            /** Started At */
            started_at: string | null;
            /** Finished At */
            finished_at: string | null;
            /** Latency Ms */
            latency_ms: number | null;
            /** Agent */
            agent: string | null;
            /** Inference */
            inference: string | null;
            /** Model */
            model: string | null;
            /** Profile */
            profile: string | null;
            /** Cost Usd */
            cost_usd: string;
            /** Tokens In */
            tokens_in: number;
            /** Tokens Out */
            tokens_out: number;
            /** Cache Hit */
            cache_hit: boolean;
            /** Degraded */
            degraded: boolean;
            /** Summary */
            summary: string | null;
            input_ref: components["schemas"]["ValueRef"] | null;
            output_ref: components["schemas"]["ValueRef"] | null;
            /** Trace Id */
            trace_id: string | null;
            /** Span Id */
            span_id: string | null;
            /**
             * Recovered Items
             * @default []
             */
            recovered_items: components["schemas"]["ItemRecovery"][];
            /** Provenance */
            provenance: {
                [key: string]: components["schemas"]["SlotProvenance"];
            };
            input_schema?: components["schemas"]["JsonValue"];
            output_schema?: components["schemas"]["JsonValue"];
            /**
             * Schema Source
             * @default unavailable
             * @enum {string}
             */
            schema_source: "run" | "current" | "unavailable";
            /**
             * Allowed Sets
             * @default []
             */
            allowed_sets: components["schemas"]["ResolvedAllowedSet"][];
            prompt: components["schemas"]["PromptTrace"] | null;
            response: components["schemas"]["ResponseTrace"] | null;
            /** Attempts */
            attempts: components["schemas"]["Attempt"][];
            /** Checks */
            checks: components["schemas"]["CheckOutcome"][];
            /** Rule Firings */
            rule_firings: components["schemas"]["JsonObject"][];
            error: components["schemas"]["RunError"] | null;
            human: components["schemas"]["HumanWaitDetail"] | null;
        };
        /** @enum {string} */
        ExecutionStatus: "pending" | "running" | "ok" | "failed" | "skipped" | "suspended" | "cancelled";
        /** @enum {string} */
        ExperimentChangeKind: "added" | "modified" | "deleted";
        /** ExperimentChanged */
        ExperimentChanged: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Tree Hash */
            tree_hash: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "experiment_changed";
            /** Experiment Id */
            experiment_id: string;
            change: components["schemas"]["ExperimentChangeKind"];
            /** Paths */
            paths: string[];
        };
        /** ExperimentDetailView */
        ExperimentDetailView: {
            /** Experiment Id */
            experiment_id: string;
            /** Description */
            description: string;
            /** Flow Id */
            flow_id: string | null;
            subject: components["schemas"]["SubjectView"];
            /** Failure Mode */
            failure_mode: string | null;
            question: components["schemas"]["QuestionKind"];
            /** Variants */
            variants: string[];
            /** Baseline */
            baseline: string | null;
            /** Candidate */
            candidate: string | null;
            latest: components["schemas"]["LatestSeries"] | null;
            /** Series Count */
            series_count: number;
            /** Spent Usd */
            spent_usd: string;
            question_detail: components["schemas"]["QuestionView"];
            /** Arms */
            arms: components["schemas"]["ArmView"][];
            cases: components["schemas"]["CaseSelectionView"];
            /** Variant Details */
            variant_details: components["schemas"]["VariantView"][];
            /** Checks */
            checks: components["schemas"]["CheckView"][];
            /** Metrics */
            metrics: components["schemas"]["MetricColumn"][];
            plan: components["schemas"]["ExperimentPlan"];
            /** Notes */
            notes: string | null;
            files: components["schemas"]["ExperimentFilesView"];
        };
        /** ExperimentFilesView */
        ExperimentFilesView: {
            /** Spec */
            spec: string;
            /** Notes */
            notes: string | null;
        };
        /** ExperimentOrigin */
        ExperimentOrigin: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "experiment";
            /** Experiment Id */
            experiment_id: string;
        };
        /**
         * ExperimentPlan
         * @description The default size of a series: how many cases and how many repeats per case.
         *
         *     These are the author's defaults, not limits: a series may run fewer or more, and the Studio shows the
         *     recommended size next to them. ``cases`` unset means every selected case.
         */
        ExperimentPlan: {
            /** Cases */
            cases?: number | null;
            /**
             * Repeats
             * @default 1
             */
            repeats: number;
        };
        /** ExperimentSummaryView */
        ExperimentSummaryView: {
            /** Experiment Id */
            experiment_id: string;
            /** Description */
            description: string;
            /** Flow Id */
            flow_id: string | null;
            subject: components["schemas"]["SubjectView"];
            /** Failure Mode */
            failure_mode: string | null;
            question: components["schemas"]["QuestionKind"];
            /** Variants */
            variants: string[];
            /** Baseline */
            baseline: string | null;
            /** Candidate */
            candidate: string | null;
            latest: components["schemas"]["LatestSeries"] | null;
            /** Series Count */
            series_count: number;
            /** Spent Usd */
            spent_usd: string;
        };
        /** FailOnTimeout */
        FailOnTimeout: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            policy: "fail";
        };
        /** FamiliesDistinct */
        FamiliesDistinct: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            rule: "families_distinct";
            /** Nodes */
            nodes: string[];
            /** Min */
            min: number;
        };
        /** FamilyDisjointFromInput */
        FamilyDisjointFromInput: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            rule: "family_disjoint_from_input";
            /** Nodes */
            nodes: string[];
            /** Input */
            input: string;
        };
        /** FieldBefore */
        FieldBefore: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            rule: "field_before";
            /** Nodes */
            nodes: string[];
            /** First */
            first: string;
            /** Second */
            second: string;
        };
        /** FieldBinding */
        FieldBinding: {
            /** Name */
            name: string;
            /** From */
            from?: string | null;
            value?: components["schemas"]["JsonValue"];
        };
        /** FieldDecl */
        FieldDecl: {
            /** Name */
            name: string;
            /** Type */
            type: string;
            /** Description */
            description: string;
            /** Maxlength */
            maxLength?: number | null;
            /** Maxitems */
            maxItems?: number | null;
            /** Minimum */
            minimum?: number | null;
            /** Maximum */
            maximum?: number | null;
            /** Pattern */
            pattern?: string | null;
            /** Enum */
            enum?: string[] | null;
        };
        /** FieldIr */
        FieldIr: {
            name: components["schemas"]["FieldName"];
            type: components["schemas"]["TypeRefText"];
            /** Description */
            description: string;
        };
        FieldName: string;
        /** FileChange */
        FileChange: {
            /** Path */
            path: string;
            change: components["schemas"]["ChangeKind"];
            /** File Hash Before */
            file_hash_before: string | null;
            /** File Hash After */
            file_hash_after: string | null;
        };
        /** FileDetail */
        FileDetail: {
            /** Path */
            path: string;
            kind: components["schemas"]["FileKind"];
            /** File Hash */
            file_hash: string;
            size_bytes: components["schemas"]["Count"];
            mtime_ns: components["schemas"]["Count"];
            parse_status: components["schemas"]["ParseStatus"];
            sync_state: components["schemas"]["SyncState"];
            problems_count: components["schemas"]["Count"];
            /** Last Good Content Hash */
            last_good_content_hash: string | null;
            /** Problems */
            problems: components["schemas"]["Diagnostic"][];
        };
        /** FileEntry */
        FileEntry: {
            /** Path */
            path: string;
            kind: components["schemas"]["FileKind"];
            /** File Hash */
            file_hash: string;
            size_bytes: components["schemas"]["Count"];
            mtime_ns: components["schemas"]["Count"];
            parse_status: components["schemas"]["ParseStatus"];
            sync_state: components["schemas"]["SyncState"];
            problems_count: components["schemas"]["Count"];
            /** Last Good Content Hash */
            last_good_content_hash: string | null;
        };
        FileHash: string;
        /** @enum {string} */
        FileKind: "Project" | "Type" | "Flow" | "Node" | "Dataset" | "Experiment" | "Inference" | "Agent" | "Tool" | "McpServer" | "Finding" | "prompt" | "code" | "lock" | "other";
        /** FileRef */
        FileRef: {
            /** Path */
            path: string;
            /** File Hash */
            file_hash: string;
        };
        /** FilesChanged */
        FilesChanged: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Tree Hash */
            tree_hash: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "files_changed";
            /** Changes */
            changes: components["schemas"]["FileChange"][];
            actor: components["schemas"]["SpecActor"];
            /** Client Op Id */
            client_op_id: string | null;
            /** Ops */
            ops: components["schemas"]["JsonValue"][] | null;
            /** Summary */
            summary: string;
        };
        /** FindingWritten */
        FindingWritten: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Tree Hash */
            tree_hash: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "finding_written";
            /** Experiment Id */
            experiment_id: string;
            /** Series Id */
            series_id: string;
            /** Paths */
            paths: string[];
        };
        /** @enum {string} */
        FinishedExecutionStatus: "ok" | "failed" | "skipped" | "cancelled";
        /** FlowDetail */
        FlowDetail: {
            /** Flow Id */
            flow_id: string;
            /** Root Path */
            root_path: string;
            compile_status: components["schemas"]["CompileStatus"];
            problems: components["schemas"]["ProblemCounts"];
            first_problem: components["schemas"]["Diagnostic"] | null;
            node_count: components["schemas"]["Count"];
            /** Input Type */
            input_type: string | null;
            /** Output Type */
            output_type: string | null;
            /** Context */
            context: components["schemas"]["RunContextKey"][];
            /** Content Hash */
            content_hash: string | null;
            last_run: components["schemas"]["RunBrief"] | null;
            /** Description */
            description: string | null;
            /** Files */
            files: components["schemas"]["FileRef"][];
            /** Tree Hash */
            tree_hash: string;
            /** Order */
            order: string[];
            /** Diagnostics */
            diagnostics: components["schemas"]["Diagnostic"][];
            /** Layout Rev */
            layout_rev: string | null;
        };
        /** FlowIr */
        FlowIr: {
            /** Flow Id */
            flow_id: string;
            /** Content Hash */
            content_hash: string;
            ir: components["schemas"]["CompiledProject"];
        };
        /** FlowSchemas */
        FlowSchemas: {
            /** Flow Id */
            flow_id: string;
            input: components["schemas"]["JsonValue"];
            output: components["schemas"]["JsonValue"];
            /** Context */
            context: components["schemas"]["RunContextKey"][];
            /** Nodes */
            nodes: {
                [key: string]: components["schemas"]["NodeSchemas"];
            };
        };
        /** FlowSpec */
        FlowSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Flow";
            /** Description */
            description: string;
            /** Input */
            input: string;
            /** Output */
            output: string;
            /** Returns */
            returns: components["schemas"]["FieldBinding"][];
            /** Context */
            context?: components["schemas"]["RunContextKey"][] | null;
            limits?: components["schemas"]["Limits"] | null;
            /** Order */
            order: string[];
            /** Requires */
            requires?: components["schemas"]["ContractPredicate"][] | null;
        };
        /** FlowSpecView */
        FlowSpecView: {
            /** Flow Id */
            flow_id: string;
            flow: components["schemas"]["FlowSpec"] | null;
            /** Builder Path */
            builder_path: string | null;
            /** Nodes */
            nodes: {
                [key: string]: components["schemas"]["NodeSpec"];
            };
        };
        /** FlowSummary */
        FlowSummary: {
            /** Flow Id */
            flow_id: string;
            /** Root Path */
            root_path: string;
            compile_status: components["schemas"]["CompileStatus"];
            problems: components["schemas"]["ProblemCounts"];
            first_problem: components["schemas"]["Diagnostic"] | null;
            node_count: components["schemas"]["Count"];
            /** Input Type */
            input_type: string | null;
            /** Output Type */
            output_type: string | null;
            /** Context */
            context: components["schemas"]["RunContextKey"][];
            /** Content Hash */
            content_hash: string | null;
            last_run: components["schemas"]["RunBrief"] | null;
        };
        /** @enum {string} */
        ForkBase: "original" | "working";
        /** ForkOverrides */
        ForkOverrides: {
            input?: components["schemas"]["JsonValue"];
            /** Agent */
            agent?: string | null;
            prompt_source?: components["schemas"]["PromptSource"] | null;
        };
        /** ForkRequest */
        ForkRequest: {
            from: components["schemas"]["ExecutionAddress"];
            overrides?: components["schemas"]["ForkOverrides"] | null;
            /** @default original */
            at: components["schemas"]["ForkBase"];
        };
        /** GuardrailView */
        GuardrailView: {
            /** Metric */
            metric: string;
            direction: components["schemas"]["MetricDirection"];
            /** Margin */
            margin: number;
            /** Relative */
            relative: boolean;
        };
        /** HumanAnswerStatus */
        HumanAnswerStatus: {
            address: components["schemas"]["ExecutionAddress"];
            /** Attempt */
            attempt: number;
            /** Consumed */
            consumed: boolean;
        };
        /** HumanNodeSpec */
        HumanNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "human";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** Form */
            form: string;
            /** Assignee */
            assignee: string;
            /** Timeout Seconds */
            timeout_seconds: number;
            on_timeout: components["schemas"]["TimeoutPolicy"];
            /** In */
            in?: components["schemas"]["InputField"][];
        };
        /** HumanWait */
        HumanWait: {
            address: components["schemas"]["ExecutionAddress"];
            wait_kind: components["schemas"]["WaitKind"];
            /** Attempt */
            attempt: number;
            state: components["schemas"]["WaitState"];
            /** Assignee */
            assignee: string;
            /**
             * Waiting Since
             * Format: date-time
             */
            waiting_since: string;
            /**
             * Deadline At
             * Format: date-time
             */
            deadline_at: string;
            on_timeout: components["schemas"]["OnTimeoutAction"];
            /** Form Type Id */
            form_type_id: string;
        };
        /** HumanWaitAttempt */
        HumanWaitAttempt: {
            /** Attempt */
            attempt: number;
            /** Assignee */
            assignee: string;
            /**
             * Waiting Since
             * Format: date-time
             */
            waiting_since: string;
            /**
             * Deadline At
             * Format: date-time
             */
            deadline_at: string;
            state: components["schemas"]["WaitState"];
            /** Resolved At */
            resolved_at: string | null;
        };
        /** HumanWaitDetail */
        HumanWaitDetail: {
            address: components["schemas"]["ExecutionAddress"];
            wait_kind: components["schemas"]["WaitKind"];
            /** Attempt */
            attempt: number;
            state: components["schemas"]["WaitState"];
            /** Assignee */
            assignee: string;
            /**
             * Waiting Since
             * Format: date-time
             */
            waiting_since: string;
            /**
             * Deadline At
             * Format: date-time
             */
            deadline_at: string;
            on_timeout: components["schemas"]["OnTimeoutAction"];
            /** Form Type Id */
            form_type_id: string;
            form_schema: components["schemas"]["JsonObject"];
            suspend_data: components["schemas"]["ValueRef"] | null;
            /** Attempts */
            attempts: components["schemas"]["HumanWaitAttempt"][];
            /** Resolved By */
            resolved_by: string | null;
            answer_ref: components["schemas"]["ValueRef"] | null;
            /** Ignored Answers */
            ignored_answers: components["schemas"]["IgnoredAnswer"][];
        };
        /** IdType */
        IdType: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Type";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "id";
            /** Description */
            description: string;
            /** @default none */
            pii: components["schemas"]["PiiClass"];
            /** Pattern */
            pattern?: string | null;
            /** Maxlength */
            maxLength?: number | null;
            /** @default none */
            allowed_set: components["schemas"]["AllowedSetMode"];
            code_format?: components["schemas"]["CodeFormat"] | null;
        };
        /** IgnoredAnswer */
        IgnoredAnswer: {
            /** Client Op Id */
            client_op_id: string;
            /**
             * Sent At
             * Format: date-time
             */
            sent_at: string;
            /** Problems */
            problems: components["schemas"]["Problem"][];
        };
        /** @enum {string} */
        IncludePayloads: "none" | "truncated" | "full";
        /** IndexState */
        IndexState: {
            status: components["schemas"]["IndexStatus"];
            /** Generation */
            generation: number;
            /**
             * Indexed At
             * Format: date-time
             */
            indexed_at: string;
            pending_files: components["schemas"]["Count"];
        };
        /** @enum {string} */
        IndexStatus: "ready" | "building" | "degraded";
        /** InferenceChecksCaptured */
        InferenceChecksCaptured: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "inference_checks_captured";
            address: components["schemas"]["ExecutionAddress"];
            /** Checks */
            checks: components["schemas"]["CheckOutcome"][];
        };
        /** InferenceDisplaySpec */
        InferenceDisplaySpec: {
            input?: components["schemas"]["DisplayFormatterSpec"] | null;
            output?: components["schemas"]["DisplayFormatterSpec"] | null;
        };
        /** InferenceInputCaptured */
        InferenceInputCaptured: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "inference_input_captured";
            address: components["schemas"]["ExecutionAddress"];
            /**
             * Stage
             * @enum {string}
             */
            stage: "bound" | "normalized";
            /** Agent */
            agent: string;
            /** Inference */
            inference: string;
            input_ref: components["schemas"]["InlineValue"];
            /** Variants */
            variants: {
                [key: string]: string;
            };
        };
        /** InferencePromptCaptured */
        InferencePromptCaptured: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "inference_prompt_captured";
            address: components["schemas"]["ExecutionAddress"];
            prompt: components["schemas"]["PromptTrace"];
        };
        /** InferenceSpec */
        InferenceSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Inference";
            /** Description */
            description: string;
            /** In */
            in?: components["schemas"]["FieldDecl"][];
            /** Out */
            out: components["schemas"]["OutputField"][];
            /** Prompt */
            prompt?: string | null;
            /** Variants */
            variants?: {
                [key: string]: components["schemas"]["VariantSlot"];
            } | null;
            /** Allowed Sets */
            allowed_sets?: components["schemas"]["AllowedSetSpec"][] | null;
            /** Examples */
            examples?: components["schemas"]["ExampleSpec"][] | null;
            /** Checks */
            checks?: components["schemas"]["CheckSpec"][] | null;
            display?: components["schemas"]["InferenceDisplaySpec"] | null;
        };
        /** InlineValue */
        InlineValue: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "inline";
            value: components["schemas"]["JsonValue"];
        };
        /** InputField */
        InputField: {
            /** Name */
            name: string;
            /** Type */
            type: string;
            /** Description */
            description: string;
            /** Maxlength */
            maxLength?: number | null;
            /** Maxitems */
            maxItems?: number | null;
            /** Minimum */
            minimum?: number | null;
            /** Maximum */
            maximum?: number | null;
            /** Pattern */
            pattern?: string | null;
            /** Enum */
            enum?: string[] | null;
            /** From */
            from?: string | null;
            value?: components["schemas"]["JsonValue"];
        };
        /** @enum {string} */
        InputSource: "request" | "sample";
        /** ItemError */
        ItemError: {
            /** Code */
            code: string;
            /** Message */
            message: string;
        };
        /** ItemRecovery */
        ItemRecovery: {
            /** Item Index */
            item_index: number;
            /** Policy */
            policy: string;
            decision: components["schemas"]["ItemRecoveryDecision"];
            error: components["schemas"]["ItemError"];
            default_ref: components["schemas"]["ValueRef"] | null;
        };
        /** @enum {string} */
        ItemRecoveryDecision: "skip" | "default";
        JsonObject: {
            [key: string]: components["schemas"]["JsonValue"];
        };
        JsonParams: {
            [key: string]: components["schemas"]["JsonValue"];
        };
        JsonPointer: string;
        JsonSchema: {
            [key: string]: components["schemas"]["JsonValue"];
        };
        JsonValue: unknown;
        /** JudgeEvaluator */
        JudgeEvaluator: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "judge";
            /** Inference */
            inference: string;
            /** Agent */
            agent: string;
        };
        /** LatestSeries */
        LatestSeries: {
            /** Series Id */
            series_id: string;
            on: components["schemas"]["SeriesSplit"];
            status: components["schemas"]["SeriesStatus"];
            verdict: components["schemas"]["VerdictState"] | null;
        };
        /** LaunchPlan */
        LaunchPlan: {
            on: components["schemas"]["SeriesSplit"];
            /** Cases */
            cases: number;
            /** Repeats */
            repeats: number;
            /** Variants */
            variants: number;
            /** Attempts */
            attempts: number;
            /** Available */
            available: number;
            /** Half Width */
            half_width: number | null;
            /** Mde */
            mde: number | null;
            /** Margin */
            margin: number | null;
            /** Spread */
            spread: number | null;
            /**
             * Spread Source
             * @enum {string}
             */
            spread_source: "history" | "prior" | "none";
            /** Icc */
            icc: number;
            recommended: components["schemas"]["Recommendation"];
            /** Below Recommended */
            below_recommended: boolean;
            /** Needs Approval */
            needs_approval: boolean;
            /** Project Cap Usd */
            project_cap_usd: string;
            project_cap_source?: components["schemas"]["CapSource"] | null;
            /** Cap Usd */
            cap_usd: string;
            /**
             * Warnings
             * @default []
             */
            warnings: string[];
        };
        /** LaunchRequest */
        LaunchRequest: {
            /** @default dev */
            on: components["schemas"]["SeriesSplit"];
            /** Cases */
            cases?: number | null;
            /** Repeats */
            repeats?: number | null;
            /** Cap Usd */
            cap_usd?: number | string | null;
        };
        /** Limits */
        Limits: {
            /** Requests */
            requests?: number | null;
            /** Tool Calls */
            tool_calls?: number | null;
            /** Tokens */
            tokens?: number | null;
            /** Usd Micros */
            usd_micros?: number | null;
            /** Seconds */
            seconds?: number | null;
        };
        /** Lineage */
        Lineage: {
            relation: components["schemas"]["LineageRelation"];
            /** Parent Run Id */
            parent_run_id: string;
        };
        /** @enum {string} */
        LineageRelation: "fork" | "replay";
        /** LiteralBinding */
        LiteralBinding: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "literal";
            name: components["schemas"]["FieldName"];
            value: components["schemas"]["JsonValue"];
        };
        /** LlmNodeSpec */
        LlmNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "llm";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** Inference */
            inference?: string | null;
            /** Agent */
            agent: string;
            /** In */
            in?: components["schemas"]["FieldBinding"][];
        };
        /** LocalUserView */
        LocalUserView: {
            /** Assignee */
            assignee: string;
            source: components["schemas"]["AssigneeSource"];
            /** Setting Key */
            setting_key: string;
        };
        /** @enum {string} */
        LoginMethod: "subscription" | "api_key";
        /** @enum {string} */
        LoginState: "logged_in" | "logged_out" | "unknown";
        /** LoginStatus */
        LoginStatus: {
            backend: components["schemas"]["AgentBackendKind"];
            state: components["schemas"]["LoginState"];
            method: components["schemas"]["LoginMethod"] | null;
            /** Account */
            account: string | null;
            /** Detail */
            detail: string | null;
        };
        /** LookOrigin */
        LookOrigin: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "look";
            /** Flow Id */
            flow_id: string;
            /** Dataset Id */
            dataset_id: string;
            /** Case Names */
            case_names: string[];
            /** Start Node */
            start_node?: string | null;
            /** End Node */
            end_node?: string | null;
        };
        /** LookTarget */
        LookTarget: {
            /** Flow Id */
            flow_id: string;
            /** Dataset Id */
            dataset_id: string;
            /** Case Names */
            case_names: string[];
            /** Start Node */
            start_node?: string | null;
            /** End Node */
            end_node?: string | null;
        };
        /** LoopExited */
        LoopExited: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "loop_exited";
            address: components["schemas"]["ExecutionAddress"];
            reason: components["schemas"]["LoopStopReason"];
            /** Selected Iteration */
            selected_iteration: number | null;
        };
        /** LoopIterationFinished */
        LoopIterationFinished: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "loop_iteration_finished";
            address: components["schemas"]["ExecutionAddress"];
            /** Score */
            score: number | null;
            stop_reason: components["schemas"]["LoopStopReason"] | null;
        };
        /** LoopNodeSpec */
        LoopNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "loop";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** Body */
            body: string[];
            /** Init */
            init?: {
                [key: string]: components["schemas"]["FieldBinding"][];
            } | null;
            /** Max Iter */
            max_iter: number;
            /** Stop */
            stop?: components["schemas"]["PolicyRef"][] | null;
            select: components["schemas"]["PolicyRef"];
            /** Out */
            out: components["schemas"]["BoundField"][];
        };
        /**
         * LoopStopReason
         * @enum {string}
         */
        LoopStopReason: "policy" | "max_iter" | "budget";
        /** ManualMissingRangeData */
        ManualMissingRangeData: {
            /** Reference */
            reference: string;
            /** Reason */
            reason: string;
        };
        /** ManualRangePair */
        ManualRangePair: {
            /** Start Node */
            start_node: string;
            /** End Node */
            end_node: string;
            /** Available */
            available: boolean;
            /** Input Paths */
            input_paths: string[];
            /** Context Keys */
            context_keys: string[];
            /** Node Output Paths */
            node_output_paths: string[];
            /** Missing */
            missing: components["schemas"]["ManualMissingRangeData"][];
        };
        /** ManualRangePreview */
        ManualRangePreview: {
            /** Order */
            order: string[];
            /** Ranges */
            ranges: components["schemas"]["ManualRangePair"][];
        };
        /** ManualRangeRequest */
        ManualRangeRequest: {
            input?: components["schemas"]["JsonValue"];
            /** Context */
            context?: {
                [key: string]: components["schemas"]["JsonValue"];
            };
            /** Node Outputs */
            node_outputs?: {
                [key: string]: components["schemas"]["JsonValue"];
            };
        };
        /** MapItemRecovered */
        MapItemRecovered: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "map_item_recovered";
            address: components["schemas"]["ExecutionAddress"];
            recovery: components["schemas"]["ItemRecovery"];
        };
        /** MapNodeSpec */
        MapNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "map";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** Over */
            over: string;
            /** Body */
            body: string;
            /** Concurrency */
            concurrency?: number | null;
            on_item_error: components["schemas"]["PolicyRef"];
            /** Out */
            out: components["schemas"]["BoundField"][];
        };
        /** MatrixRow */
        MatrixRow: {
            /** Variant Id */
            variant_id: string;
            role: components["schemas"]["VariantRole"];
            /** Cells */
            cells: components["schemas"]["MetricCell"][];
        };
        /** McpToolSource */
        McpToolSource: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "mcp";
            /** Server */
            server: string;
            /** Tool */
            tool: string;
        };
        /** MediaValue */
        MediaValue: {
            /** $Media */
            $media: string;
            /** Blob Id */
            blob_id: string;
            /** Size Bytes */
            size_bytes: number;
            /** Name */
            name: string | null;
            /** Url */
            readonly url?: string | null;
            /** Poster Blob Id */
            readonly poster_blob_id?: string | null;
            /** Note */
            readonly note?: string | null;
        };
        /** @enum {string} */
        MessageOrigin: "example" | "prompt";
        /** MetricCell */
        MetricCell: {
            /** Metric */
            metric: string;
            /** Value */
            value: number | null;
            /** Low */
            low: number | null;
            /** High */
            high: number | null;
            verdict: components["schemas"]["CellVerdict"];
            method: components["schemas"]["StatMethod"] | null;
            /** Cases */
            cases: number;
        };
        /** MetricColumn */
        MetricColumn: {
            /** Metric */
            metric: string;
            role: components["schemas"]["MetricRole"];
            direction: components["schemas"]["MetricDirection"];
            unit: components["schemas"]["MetricUnit"];
            /** Margin */
            margin: number | null;
            /** Relative */
            relative: boolean;
        };
        /**
         * MetricDirection
         * @enum {string}
         */
        MetricDirection: "higher_is_better" | "lower_is_better";
        /**
         * MetricKind
         * @enum {string}
         */
        MetricKind: "binary" | "ordinal" | "continuous";
        /**
         * MetricRole
         * @enum {string}
         */
        MetricRole: "primary" | "guardrail" | "check" | "builtin";
        /**
         * MetricUnit
         * @enum {string}
         */
        MetricUnit: "rate" | "score" | "ordinal" | "usd" | "ms";
        /** MissingRangeData */
        MissingRangeData: {
            /** Case Name */
            case_name: string;
            /** Reference */
            reference: string;
            /** Reason */
            reason: string;
        };
        /** ModelErrorDetails */
        ModelErrorDetails: {
            /** Agent */
            agent?: string | null;
            /** Model */
            model?: string | null;
            output_mode?: components["schemas"]["ResolvedOutputMode"] | null;
            /** Attempt */
            attempt?: number | null;
            /** Raw Excerpt */
            raw_excerpt?: string | null;
            /**
             * Violations
             * @default []
             */
            violations: components["schemas"]["Problem"][];
            /** Status Code */
            status_code?: number | null;
            /** Provider */
            provider?: string | null;
            /** Provider Code */
            provider_code?: string | null;
            /** Provider Response */
            provider_response?: string | null;
            output_shape?: components["schemas"]["OutputShape"] | null;
        };
        /**
         * ModelFamily
         * @enum {string}
         */
        ModelFamily: "openai" | "anthropic" | "google" | "deepseek" | "qwen" | "moonshot" | "zhipu" | "xai" | "meta" | "mistral" | "other";
        ModelField: string;
        /** ModelSettingsSpec */
        ModelSettingsSpec: {
            /** Temperature */
            temperature?: number | null;
            /** Top P */
            top_p?: number | null;
            /** Max Tokens */
            max_tokens?: number | null;
            /** Seed */
            seed?: number | null;
            /** Provider Options */
            provider_options?: {
                [key: string]: components["schemas"]["JsonValue"];
            } | null;
        };
        ModelText: string;
        /** NarrowNodeSpec */
        NarrowNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "narrow";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** From */
            from: string;
            /** To */
            to: string;
        };
        /** NodeAgentModel */
        NodeAgentModel: {
            /** Model */
            model: string;
            /** Provider */
            provider: string;
            family: components["schemas"]["ModelFamily"];
        };
        /** NodeAgentRuntime */
        NodeAgentRuntime: {
            /** Models */
            models: components["schemas"]["NodeAgentModel"][] | null;
            output: components["schemas"]["CompiledAgentOutput"] | null;
            /** Instructions */
            instructions: string | null;
        };
        /** NodeAnswerIgnored */
        NodeAnswerIgnored: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_answer_ignored";
            address: components["schemas"]["ExecutionAddress"];
            /** Attempt */
            attempt: number;
            /** Client Op Id */
            client_op_id: string;
            /**
             * Sent At
             * Format: date-time
             */
            sent_at: string;
            /** Problems */
            problems: components["schemas"]["Problem"][];
        };
        /** NodeAttemptDiscarded */
        NodeAttemptDiscarded: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_attempt_discarded";
            address: components["schemas"]["ExecutionAddress"];
            /** Attempt */
            attempt: number;
            cause: components["schemas"]["AttemptCauseKind"];
            /** Discarded Parts */
            discarded_parts: number;
        };
        /** NodeAttemptFailed */
        NodeAttemptFailed: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_attempt_failed";
            address: components["schemas"]["ExecutionAddress"];
            /** Attempt */
            attempt: number;
            cause: components["schemas"]["AttemptCause"];
            action: components["schemas"]["AttemptAction"];
        };
        /** NodeBindingView */
        NodeBindingView: {
            /** Slot */
            slot: string;
            /** Ref */
            ref: string | null;
            value?: components["schemas"]["JsonValue"];
        };
        /** NodeCode */
        NodeCode: {
            /** Ref */
            ref: string;
            declared_in: components["schemas"]["JsonValue"];
            declared_out: components["schemas"]["JsonValue"];
        };
        /** NodeCounts */
        NodeCounts: {
            /** Pending */
            pending: number;
            /** Running */
            running: number;
            /** Ok */
            ok: number;
            /** Failed */
            failed: number;
            /** Skipped */
            skipped: number;
            /** Suspended */
            suspended: number;
            /** Cancelled */
            cancelled: number;
            /**
             * Items Replaced
             * @default 0
             */
            items_replaced: number;
            /**
             * Items Skipped
             * @default 0
             */
            items_skipped: number;
        };
        /** NodeDetail */
        NodeDetail: {
            /** Node Id */
            node_id: string;
            /** Local Id */
            local_id: string;
            /** Parent */
            parent: string | null;
            kind: components["schemas"]["NodeKind"];
            /** Path */
            path: string;
            /** File Hash */
            file_hash: string;
            /** Agent */
            agent: string | null;
            /** Inference */
            inference: string | null;
            prompt_level: components["schemas"]["aqven__server__resources__PromptLevel"] | null;
            /** Code Ref */
            code_ref: string | null;
            problems_count: components["schemas"]["Count"];
            /** Upstream */
            upstream: string[];
            /** Downstream */
            downstream: string[];
            spec: components["schemas"]["NodeSpec"];
            ir_node: components["schemas"]["CompiledNode"] | null;
            in_schema: components["schemas"]["JsonValue"];
            out_schema: components["schemas"]["JsonValue"];
            form_schema: components["schemas"]["JsonValue"];
            /** Bindings */
            bindings: components["schemas"]["NodeBindingView"][];
            prompt: components["schemas"]["NodePromptRef"] | null;
            code: components["schemas"]["NodeCode"] | null;
            /** Dynamic Slots */
            dynamic_slots: components["schemas"]["DynamicSlot"][];
            /** Value Shapes */
            value_shapes?: {
                [key: string]: components["schemas"]["NodeValueShape"];
            };
            /** Problems */
            problems: components["schemas"]["Diagnostic"][];
            inference_spec?: components["schemas"]["InferenceSpec"] | null;
            /** Inference Path */
            inference_path?: string | null;
            agent_spec?: components["schemas"]["AgentSpec"] | null;
            agent_runtime?: components["schemas"]["NodeAgentRuntime"] | null;
            /** Agent Path */
            agent_path?: string | null;
            /** Display Sources */
            display_sources?: {
                [key: string]: components["schemas"]["NodeDisplaySource"];
            };
            /** Allowed Set Descriptions */
            allowed_set_descriptions?: {
                [key: string]: string;
            };
        };
        /** NodeDisplayPreview */
        NodeDisplayPreview: {
            /**
             * Source
             * @enum {string}
             */
            source: "example" | "schema";
            /** Example Name */
            example_name?: string | null;
            sample_output: components["schemas"]["JsonObject"];
            document: components["schemas"]["DisplayDocument"];
        };
        /** NodeDisplaySource */
        NodeDisplaySource: {
            /** Path */
            path: string;
            /** Text */
            text: string;
        };
        /** NodeExecution */
        NodeExecution: {
            address: components["schemas"]["ExecutionAddress"];
            kind: components["schemas"]["NodeKind"];
            status: components["schemas"]["ExecutionStatus"];
            /** Attempts Count */
            attempts_count: number;
            /** Started At */
            started_at: string | null;
            /** Finished At */
            finished_at: string | null;
            /** Latency Ms */
            latency_ms: number | null;
            /** Agent */
            agent: string | null;
            /** Inference */
            inference: string | null;
            /** Model */
            model: string | null;
            /** Profile */
            profile: string | null;
            /** Cost Usd */
            cost_usd: string;
            /** Tokens In */
            tokens_in: number;
            /** Tokens Out */
            tokens_out: number;
            /** Cache Hit */
            cache_hit: boolean;
            /** Degraded */
            degraded: boolean;
            /** Summary */
            summary: string | null;
            input_ref: components["schemas"]["ValueRef"] | null;
            output_ref: components["schemas"]["ValueRef"] | null;
            /** Trace Id */
            trace_id: string | null;
            /** Span Id */
            span_id: string | null;
            /**
             * Recovered Items
             * @default []
             */
            recovered_items: components["schemas"]["ItemRecovery"][];
        };
        /** NodeFinished */
        NodeFinished: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_finished";
            address: components["schemas"]["ExecutionAddress"];
            status: components["schemas"]["FinishedExecutionStatus"];
            /** Attempt */
            attempt: number;
            output_ref: components["schemas"]["ValueRef"] | null;
            /** Cost Usd */
            cost_usd: string;
            /** Tokens In */
            tokens_in: number;
            /** Tokens Out */
            tokens_out: number;
            /** Latency Ms */
            latency_ms: number;
            /**
             * Wait Ms
             * @default 0
             */
            wait_ms: number;
            /** Model */
            model: string | null;
            /** Cache Hit */
            cache_hit: boolean;
            /** Degraded */
            degraded: boolean;
            /** Checks Failed */
            checks_failed: number;
            error?: components["schemas"]["RunError"] | null;
            /** @default provider */
            cost_source: components["schemas"]["CostSource"];
            /**
             * Unpriced Calls
             * @default 0
             */
            unpriced_calls: number;
        };
        /**
         * NodeKind
         * @enum {string}
         */
        NodeKind: "llm" | "code" | "tool" | "human" | "parallel" | "map" | "switch" | "loop" | "call" | "narrow";
        /** NodeOutputDelta */
        NodeOutputDelta: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_output_delta";
            address: components["schemas"]["ExecutionAddress"];
            /** Attempt */
            attempt: number;
            part_kind: components["schemas"]["OutputPartKind"];
            /** Part Index */
            part_index: number;
            /** Tool Call Id */
            tool_call_id?: string | null;
            /** Tool Name */
            tool_name?: string | null;
            /** Delta */
            delta: string;
            /** Cumulative Length */
            cumulative_length: number;
        };
        /** NodeProgress */
        NodeProgress: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_progress";
            address: components["schemas"]["ExecutionAddress"];
            /** Done */
            done: number;
            /** Total */
            total: number;
        };
        /** NodePromptRef */
        NodePromptRef: {
            /** Inference Id */
            inference_id: string;
            level: components["schemas"]["aqven__server__resources__PromptLevel"] | null;
            /** Path */
            path: string | null;
            /** Builder Ref */
            builder_ref: string | null;
        };
        /** NodeResumed */
        NodeResumed: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_resumed";
            address: components["schemas"]["ExecutionAddress"];
            /** Attempt */
            attempt: number;
            /** Resolved By */
            resolved_by: string;
            answer_ref: components["schemas"]["ValueRef"] | null;
        };
        /** NodeSchemas */
        NodeSchemas: {
            in?: components["schemas"]["JsonValue"];
            out?: components["schemas"]["JsonValue"];
            form?: components["schemas"]["JsonValue"];
        };
        NodeSpec: components["schemas"]["LlmNodeSpec"] | components["schemas"]["CodeNodeSpec"] | components["schemas"]["ToolNodeSpec"] | components["schemas"]["HumanNodeSpec"] | components["schemas"]["ParallelNodeSpec"] | components["schemas"]["MapNodeSpec"] | components["schemas"]["SwitchNodeSpec"] | components["schemas"]["LoopNodeSpec"] | components["schemas"]["CallNodeSpec"] | components["schemas"]["NarrowNodeSpec"];
        /** NodeStarted */
        NodeStarted: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_started";
            address: components["schemas"]["ExecutionAddress"];
            kind: components["schemas"]["NodeKind"];
            /** Attempt */
            attempt: number;
            /** Queued Ms */
            queued_ms: number;
        };
        /** NodeSummary */
        NodeSummary: {
            /** Node Id */
            node_id: string;
            /** Local Id */
            local_id: string;
            /** Parent */
            parent: string | null;
            kind: components["schemas"]["NodeKind"];
            /** Path */
            path: string;
            /** File Hash */
            file_hash: string;
            /** Agent */
            agent: string | null;
            /** Inference */
            inference: string | null;
            prompt_level: components["schemas"]["aqven__server__resources__PromptLevel"] | null;
            /** Code Ref */
            code_ref: string | null;
            problems_count: components["schemas"]["Count"];
            /** Upstream */
            upstream: string[];
            /** Downstream */
            downstream: string[];
        };
        /** NodeSuspended */
        NodeSuspended: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_suspended";
            address: components["schemas"]["ExecutionAddress"];
            wait_kind: components["schemas"]["WaitKind"];
            /** Attempt */
            attempt: number;
            /** Form Type Id */
            form_type_id: string;
            /** Assignee */
            assignee: string;
            /**
             * Waiting Since
             * Format: date-time
             */
            waiting_since: string;
            /**
             * Deadline At
             * Format: date-time
             */
            deadline_at: string;
            on_timeout: components["schemas"]["OnTimeoutAction"];
        };
        /** NodeValueShape */
        NodeValueShape: {
            /** Type Id */
            type_id: string;
            spec: components["schemas"]["TypeSpec"];
            json_schema: components["schemas"]["JsonValue"];
        };
        /** NodeWaitEscalated */
        NodeWaitEscalated: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_wait_escalated";
            address: components["schemas"]["ExecutionAddress"];
            /** From Attempt */
            from_attempt: number;
            /** Attempt */
            attempt: number;
            /** Assignee */
            assignee: string;
            /**
             * Deadline At
             * Format: date-time
             */
            deadline_at: string;
        };
        /** NodeWaitTimedOut */
        NodeWaitTimedOut: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "node_wait_timed_out";
            address: components["schemas"]["ExecutionAddress"];
            /** Attempt */
            attempt: number;
            on_timeout: components["schemas"]["OnTimeoutAction"];
            default_ref: components["schemas"]["ValueRef"] | null;
        };
        /**
         * OnFail
         * @enum {string}
         */
        OnFail: "retry" | "fail" | "flag";
        /** @enum {string} */
        OnTimeoutAction: "fail" | "default" | "escalate";
        /** OpenRouterRouting */
        OpenRouterRouting: {
            /**
             * Data Collection
             * @enum {string}
             */
            data_collection: "allow" | "deny";
            /** Zdr */
            zdr: boolean;
        };
        /**
         * OutcomeClass
         * @enum {string}
         */
        OutcomeClass: "ok" | "model_fail" | "schema_invalid" | "refusal" | "infra_error" | "budget_cut" | "cancelled";
        /**
         * OutcomePolicy
         * @enum {string}
         */
        OutcomePolicy: "fail" | "retry" | "fallback";
        /** OutputField */
        OutputField: {
            /** Name */
            name: string;
            /** Type */
            type: string;
            /** Description */
            description: string;
            /** Maxlength */
            maxLength?: number | null;
            /** Maxitems */
            maxItems?: number | null;
            /** Minimum */
            minimum?: number | null;
            /** Maximum */
            maximum?: number | null;
            /** Pattern */
            pattern?: string | null;
            /** Enum */
            enum?: string[] | null;
            /** Schema From */
            schema_from?: string | null;
            limits?: components["schemas"]["DynamicLimits"] | null;
            /** Value Type */
            value_type?: string | null;
        };
        /** @enum {string} */
        OutputMode: "tool" | "native" | "prompted";
        /**
         * OutputModeSetting
         * @enum {string}
         */
        OutputModeSetting: "auto" | "tool" | "native" | "prompted";
        /** @enum {string} */
        OutputModeSource: "declared" | "profile" | "known_model" | "fallback_models";
        /** @enum {string} */
        OutputPartKind: "text" | "reasoning" | "tool_call_args" | "output_json";
        /** OutputShape */
        OutputShape: {
            /**
             * Depth
             * @default 0
             */
            depth: number;
            /** Deepest Path */
            deepest_path?: string | null;
            /** Max Items */
            max_items?: number | null;
            /** Max Items Path */
            max_items_path?: string | null;
            /** Enum Size */
            enum_size?: number | null;
            /** Enum Path */
            enum_path?: string | null;
        };
        /** Page[ChatSession] */
        Page_ChatSession_: {
            /** Items */
            items: components["schemas"]["ChatSession"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[DatasetCase] */
        Page_DatasetCase_: {
            /** Items */
            items: components["schemas"]["DatasetCase"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[DatasetSummary] */
        Page_DatasetSummary_: {
            /** Items */
            items: components["schemas"]["DatasetSummary"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[ExperimentSummaryView] */
        Page_ExperimentSummaryView_: {
            /** Items */
            items: components["schemas"]["ExperimentSummaryView"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[FileEntry] */
        Page_FileEntry_: {
            /** Items */
            items: components["schemas"]["FileEntry"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[FlowSummary] */
        Page_FlowSummary_: {
            /** Items */
            items: components["schemas"]["FlowSummary"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[PromptSummary] */
        Page_PromptSummary_: {
            /** Items */
            items: components["schemas"]["PromptSummary"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[RunEvent] */
        Page_RunEvent_: {
            /** Items */
            items: components["schemas"]["RunEvent"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[RunSummary] */
        Page_RunSummary_: {
            /** Items */
            items: components["schemas"]["RunSummary"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[SeriesSummaryView] */
        Page_SeriesSummaryView_: {
            /** Items */
            items: components["schemas"]["SeriesSummaryView"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[TypeSummary] */
        Page_TypeSummary_: {
            /** Items */
            items: components["schemas"]["TypeSummary"][];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** Page[str] */
        Page_str_: {
            /** Items */
            items: string[];
            /** Next Cursor */
            next_cursor: string | null;
            /** Total Estimate */
            total_estimate: number | null;
        };
        /** ParallelNodeSpec */
        ParallelNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "parallel";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** Body */
            body: {
                [key: string]: string;
            };
            join: components["schemas"]["PolicyRef"];
            /** Out */
            out: components["schemas"]["BoundField"][];
        };
        /** @enum {string} */
        ParseStatus: "ok" | "invalid" | "unreadable";
        /**
         * PiiClass
         * @enum {string}
         */
        PiiClass: "none" | "pii" | "sensitive";
        /**
         * PiiDetector
         * @enum {string}
         */
        PiiDetector: "email" | "phone" | "card_number" | "iban" | "ip_address";
        /** PiiPolicy */
        PiiPolicy: {
            /** Mask In Traces */
            mask_in_traces: boolean;
            /** Redact */
            redact: components["schemas"]["PiiDetector"][];
        };
        PolicyName: string;
        /** PolicyRef */
        PolicyRef: {
            /** Use */
            use?: string | null;
            /** Run */
            run?: string | null;
            /** With */
            with?: {
                [key: string]: components["schemas"]["JsonValue"];
            } | null;
        };
        /** PresentationRequest */
        PresentationRequest: {
            /** Locale */
            locale: string;
            /** Targets */
            targets: components["schemas"]["PresentationTarget"][];
        };
        /** PresentationResponse */
        PresentationResponse: {
            /** Results */
            results: components["schemas"]["PresentationResult"][];
        };
        /** PresentationResult */
        PresentationResult: {
            target: components["schemas"]["PresentationTarget"];
            status: components["schemas"]["DisplayStatus"];
            document?: components["schemas"]["DisplayDocument"] | null;
            /** Formatter */
            formatter?: string | null;
            /** Formatter Version */
            formatter_version?: string | null;
            /** Error */
            error?: string | null;
        };
        /** PresentationTarget */
        PresentationTarget: {
            address: components["schemas"]["ExecutionAddress"];
            side: components["schemas"]["DisplaySide"];
        };
        /** PreviewAttachment */
        PreviewAttachment: {
            name: components["schemas"]["FieldName"];
            /** Type */
            type: string;
            /** Media Type */
            media_type: string | null;
            /** Url */
            url: string | null;
            /** Blob Id */
            blob_id: string | null;
        };
        /** PreviewMessage */
        PreviewMessage: {
            role: components["schemas"]["aqven__spec__prompts__PromptRole"];
            origin: components["schemas"]["MessageOrigin"];
            /** Text */
            text: string;
        };
        /** PreviewOutput */
        PreviewOutput: {
            delivery: components["schemas"]["PromptDelivery"];
            mode: components["schemas"]["StructuredMode"];
            declared_mode: components["schemas"]["OutputModeSetting"];
            mode_source: components["schemas"]["OutputModeSource"];
            /** Mode Reason */
            mode_reason: string;
            /** Strict */
            strict: boolean;
            /** Retries */
            retries: number;
            /** Tool Name */
            tool_name: string | null;
            /** Limits */
            limits: string | null;
            /** Mode Instruction */
            mode_instruction: string | null;
            /** Schema Instructions */
            schema_instructions: string | null;
            json_schema: components["schemas"]["JsonSchema"];
        };
        /** PreviewTool */
        PreviewTool: {
            /** Name */
            name: string;
            kind: components["schemas"]["ToolKind"];
            /** Description */
            description: string;
        };
        /** PreviewVariant */
        PreviewVariant: {
            /** Slot */
            slot: string;
            /** Case */
            case: string;
            /** Selector */
            selector: string;
            /** Forced */
            forced: boolean;
            /** Text */
            text: string;
        };
        /** Problem */
        Problem: {
            /** Path */
            path: (string | number)[];
            /** Code */
            code: string;
            /** Message */
            message: string;
        };
        /** ProblemCounts */
        ProblemCounts: {
            error: components["schemas"]["Count"];
            warning: components["schemas"]["Count"];
            info: components["schemas"]["Count"];
        };
        /** ProjectInfo */
        ProjectInfo: {
            /** Root */
            root: string;
            /** Package */
            package: string | null;
            /** Engine Version */
            engine_version: string;
            /** Tree Hash */
            tree_hash: string;
            project_file: components["schemas"]["FileRef"] | null;
            lock_file: components["schemas"]["FileRef"] | null;
            index: components["schemas"]["IndexState"];
            problems: components["schemas"]["ProblemCounts"];
            /** Quarantined Files */
            quarantined_files: string[];
            spec_seq: components["schemas"]["Count"];
            /** Mcp Url */
            mcp_url: string | null;
        };
        /** ProjectPolicies */
        ProjectPolicies: {
            pii?: components["schemas"]["PiiPolicy"] | null;
            trust?: components["schemas"]["TrustPolicy"] | null;
        };
        /** PromptAnalysis */
        PromptAnalysis: {
            /** Variables */
            variables: string[];
            /** Globals */
            globals: string[];
            /** Filters */
            filters: string[];
            /** Tags */
            tags: string[];
        };
        /** @enum {string} */
        PromptDelivery: "tool" | "native" | "prompted" | "image";
        /** PromptDetail */
        PromptDetail: {
            /** Flow Id */
            flow_id: string;
            /** Node Id */
            node_id: string;
            /** Inference Id */
            inference_id: string;
            level: components["schemas"]["aqven__server__resources__PromptLevel"] | null;
            /** Path */
            path: string | null;
            /** File Hash */
            file_hash: string | null;
            /** Builder Ref */
            builder_ref: string | null;
            /** Has Draft */
            has_draft: boolean;
            /** Draft Stale */
            draft_stale: boolean;
            problems_count: components["schemas"]["Count"];
            source: components["schemas"]["PromptSourceText"] | null;
            analysis: components["schemas"]["PromptAnalysis"] | null;
            /** Slots */
            slots: components["schemas"]["PromptSlot"][];
            /** Unused Inputs */
            unused_inputs: string[];
            /** Variant Files */
            variant_files: string[];
            /** Problems */
            problems: components["schemas"]["Diagnostic"][];
        };
        /** @enum {integer} */
        "PromptLevel-Input": 1 | 2 | 3;
        /** @enum {integer} */
        PromptLevelText: 1 | 2;
        /** PromptPart */
        PromptPart: {
            kind: components["schemas"]["PromptPartKind"];
            /** Text */
            text: string | null;
            media: components["schemas"]["MediaValue"] | null;
        };
        /** @enum {string} */
        PromptPartKind: "text" | "image" | "audio" | "video" | "document";
        /** PromptPreview */
        PromptPreview: {
            /** Flow Id */
            flow_id: string;
            /** Node Id */
            node_id: string;
            /** Agent Id */
            agent_id: string;
            /** Inference Id */
            inference_id: string;
            /** Agent File */
            agent_file: string | null;
            /** Inference File */
            inference_file: string | null;
            /** Model */
            model: string;
            /** Fallback Models */
            fallback_models: string[];
            /** Prompt Level */
            prompt_level: number;
            input_source: components["schemas"]["InputSource"];
            input: components["schemas"]["JsonObject"];
            /** Instructions */
            instructions: string | null;
            /** Messages */
            messages: components["schemas"]["PreviewMessage"][];
            /** Attachments */
            attachments: components["schemas"]["PreviewAttachment"][];
            /** Variants */
            variants: components["schemas"]["PreviewVariant"][];
            /** Tools */
            tools: components["schemas"]["PreviewTool"][];
            output: components["schemas"]["PreviewOutput"];
            /** Notes */
            notes: string[];
        };
        /** PromptPreviewBody */
        PromptPreviewBody: {
            input?: components["schemas"]["JsonObject"] | null;
            /** Variants */
            variants?: {
                [key: string]: string;
            } | null;
        };
        /** PromptSlot */
        PromptSlot: {
            /** Name */
            name: string;
            /** Type Id */
            type_id: string;
            /** Used */
            used: boolean;
        };
        /** @enum {string} */
        PromptSource: "disk" | "draft";
        /** PromptSourceText */
        PromptSourceText: {
            /** Text */
            text: string;
            /** File Hash */
            file_hash: string | null;
        };
        /** PromptSummary */
        PromptSummary: {
            /** Flow Id */
            flow_id: string;
            /** Node Id */
            node_id: string;
            /** Inference Id */
            inference_id: string;
            level: components["schemas"]["aqven__server__resources__PromptLevel"] | null;
            /** Path */
            path: string | null;
            /** File Hash */
            file_hash: string | null;
            /** Builder Ref */
            builder_ref: string | null;
            /** Has Draft */
            has_draft: boolean;
            /** Draft Stale */
            draft_stale: boolean;
            problems_count: components["schemas"]["Count"];
        };
        /** PromptTrace */
        PromptTrace: {
            level: components["schemas"]["aqven__spec__names__PromptLevel"];
            /** Template Sha256 */
            template_sha256: string | null;
            /** Rendered Sha256 */
            rendered_sha256: string;
            rendered_ref: components["schemas"]["ValueRef"] | null;
            /** Messages */
            messages: components["schemas"]["PromptTraceMessage"][];
            /** Slot Ranges */
            slot_ranges: components["schemas"]["SlotRange"][];
            /** Variants */
            variants: {
                [key: string]: string;
            };
            output_schema_sent: components["schemas"]["JsonObject"] | null;
        };
        /** PromptTraceMessage */
        PromptTraceMessage: {
            role: components["schemas"]["aqven__runtime__vocabulary__PromptRole"];
            /** Parts */
            parts: components["schemas"]["PromptPart"][];
        };
        /** ProviderCapabilitiesSpec */
        ProviderCapabilitiesSpec: {
            /** Tools */
            tools?: boolean | null;
            /** Json Schema Output */
            json_schema_output?: boolean | null;
        };
        /** ProviderKeyStatus */
        ProviderKeyStatus: {
            /** Provider */
            provider: string;
            /** Setting Key */
            setting_key: string;
            /** Env Var */
            env_var: string;
            /** Declared */
            declared: boolean;
            source: components["schemas"]["SecretSource"] | null;
            /** Masked */
            masked: string | null;
        };
        /** @enum {string} */
        ProviderKind: "catalog" | "code" | "openai_compatible";
        /** ProviderLimits */
        ProviderLimits: {
            /** Rpm */
            rpm?: number | null;
            /** Concurrency */
            concurrency?: number | null;
        };
        ProviderNameField: string;
        /** ProviderSpec */
        ProviderSpec: {
            id: components["schemas"]["ProviderNameField"];
            /** @default catalog */
            kind: components["schemas"]["ProviderKind"];
            /** Api Key */
            api_key?: string | null;
            /** Run */
            run?: string | null;
            /** Params */
            params?: {
                [key: string]: components["schemas"]["JsonValue"];
            } | null;
            capabilities?: components["schemas"]["ProviderCapabilitiesSpec"] | null;
            /** Base Url */
            base_url?: string | null;
            data_policy: components["schemas"]["DataPolicy"];
            routing?: components["schemas"]["OpenRouterRouting"] | null;
            limits?: components["schemas"]["ProviderLimits"] | null;
            /** @default auto */
            on_rate_limit: components["schemas"]["RateLimitMode"];
            /** Retry Wait Seconds */
            retry_wait_seconds?: number | null;
            /** Retry Attempts */
            retry_attempts?: number | null;
        };
        ProviderText: string;
        /** @enum {string} */
        QuestionKind: "look" | "threshold" | "compare" | "noninferior";
        /** QuestionView */
        QuestionView: {
            kind: components["schemas"]["QuestionKind"];
            /** Metric */
            metric?: string | null;
            /** Bound */
            bound?: ("above" | "below") | null;
            /** Value */
            value?: number | null;
            /** Variant */
            variant?: string | null;
            /** Baseline */
            baseline?: string | null;
            /** Candidate */
            candidate?: string | null;
            direction?: components["schemas"]["MetricDirection"] | null;
            /** Margin */
            margin?: number | null;
            /**
             * Relative
             * @default false
             */
            relative: boolean;
            /**
             * Guardrails
             * @default []
             */
            guardrails: components["schemas"]["GuardrailView"][];
        };
        /** @enum {string} */
        RateLimitMode: "auto" | "fixed" | "fail";
        /** ReadyState */
        ReadyState: {
            /**
             * Status
             * @default ready
             * @constant
             */
            status: "ready";
            /** Engine Version */
            engine_version: string;
        };
        /** Recommendation */
        Recommendation: {
            /** Cases */
            cases: number;
            /** Repeats */
            repeats: number;
            reason: components["schemas"]["RecommendationReason"];
            /** Text */
            text: string;
        };
        /**
         * RecommendationReason
         * @enum {string}
         */
        RecommendationReason: "look" | "wide" | "enough" | "no_margin" | "no_history" | "short_of_cases";
        /** RecordType */
        RecordType: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Type";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "record";
            /** Description */
            description: string;
            /** @default none */
            pii: components["schemas"]["PiiClass"];
            /** Fields */
            fields: components["schemas"]["FieldDecl"][];
        };
        /** RefBinding */
        RefBinding: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "ref";
            name: components["schemas"]["FieldName"];
            ref: components["schemas"]["RefText"];
        };
        RefText: string;
        /** ResearchBudgetView */
        ResearchBudgetView: {
            /** Spend Cap Usd */
            spend_cap_usd: string | null;
            source: components["schemas"]["CapSource"];
            /** Project Usd */
            project_usd: string | null;
            /** Default Usd */
            default_usd: string;
            /** Override Problem */
            override_problem: string | null;
            project_file: components["schemas"]["FileRef"] | null;
        };
        /** ResearchBudgetWrite */
        ResearchBudgetWrite: {
            research: components["schemas"]["ResearchSettings"];
            file_hash: components["schemas"]["FileHash"];
        };
        /** ResearchSettings */
        ResearchSettings: {
            /** Spend Cap Usd */
            spend_cap_usd: number | string;
        };
        /** ResolvedAllowedSet */
        ResolvedAllowedSet: {
            /** Type Id */
            type_id: string;
            /** Source */
            source: string;
            /** Labels From */
            labels_from: string | null;
            /** Members */
            members: components["schemas"]["AllowedSetMember"][];
        };
        /** @enum {string} */
        ResolvedOutputMode: "tool" | "native" | "prompted";
        /** ResponseTrace */
        ResponseTrace: {
            outcome: components["schemas"]["CallOutcome"];
            raw_ref: components["schemas"]["ValueRef"] | null;
            parsed_ref: components["schemas"]["ValueRef"] | null;
        };
        /** @enum {string} */
        ResumeOutcome: "accepted" | "replayed" | "sent";
        /** ResumeRequest */
        ResumeRequest: {
            address: components["schemas"]["ExecutionAddress"];
            /** Attempt */
            attempt: number;
            payload: components["schemas"]["JsonValue"];
            /** Client Op Id */
            client_op_id: string;
        };
        /** ResumeResult */
        ResumeResult: {
            outcome: components["schemas"]["ResumeOutcome"];
            status: components["schemas"]["RunStatus"];
            address: components["schemas"]["ExecutionAddress"];
            /** Attempt */
            attempt: number;
        };
        /** @enum {string} */
        ResyncReason: "window_exceeded" | "watcher_restarted" | "git_batch";
        /**
         * Retention
         * @enum {string}
         */
        Retention: "zero" | "logged" | "unknown";
        /** RunBrief */
        RunBrief: {
            /** Run Id */
            run_id: string;
            status: components["schemas"]["RunStatus"];
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
        };
        /** RunContext */
        RunContext: {
            /** Date */
            date?: string | null;
            /** Time Zone */
            time_zone?: string | null;
            /** Locale */
            locale?: string | null;
            /** Tenant Id */
            tenant_id?: string | null;
        };
        /**
         * RunContextKey
         * @enum {string}
         */
        RunContextKey: "date" | "time_zone" | "locale" | "tenant_id";
        /** RunError */
        RunError: {
            /** Code */
            code: string;
            /** Message */
            message: string;
            address: components["schemas"]["ExecutionAddress"] | null;
            /** Hint */
            hint?: string | null;
            details?: components["schemas"]["ModelErrorDetails"] | null;
        };
        RunEvent: components["schemas"]["RunStartedEvent"] | components["schemas"]["NodeStarted"] | components["schemas"]["InferenceInputCaptured"] | components["schemas"]["InferencePromptCaptured"] | components["schemas"]["InferenceChecksCaptured"] | components["schemas"]["NodeAttemptFailed"] | components["schemas"]["NodeProgress"] | components["schemas"]["MapItemRecovered"] | components["schemas"]["NodeOutputDelta"] | components["schemas"]["NodeAttemptDiscarded"] | components["schemas"]["NodeSuspended"] | components["schemas"]["NodeResumed"] | components["schemas"]["NodeAnswerIgnored"] | components["schemas"]["NodeWaitTimedOut"] | components["schemas"]["NodeWaitEscalated"] | components["schemas"]["NodeFinished"] | components["schemas"]["LoopIterationFinished"] | components["schemas"]["LoopExited"] | components["schemas"]["RunSuspended"] | components["schemas"]["RunResumed"] | components["schemas"]["RunFinished"];
        /** RunFinished */
        RunFinished: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "run_finished";
            status: components["schemas"]["TerminalRunStatus"];
            output_ref: components["schemas"]["ValueRef"] | null;
            error: components["schemas"]["RunError"] | null;
            /** Cost Usd */
            cost_usd: string;
            /** Tokens In */
            tokens_in: number;
            /** Tokens Out */
            tokens_out: number;
        };
        /** RunForked */
        RunForked: {
            /** Run Id */
            run_id: string;
            /** Lineage Parent */
            lineage_parent: string;
        };
        /** @enum {string} */
        RunMode: "live" | "replay" | "experiment" | "dryrun";
        /** RunResumed */
        RunResumed: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "run_resumed";
            address: components["schemas"]["ExecutionAddress"];
        };
        /** RunScopePreview */
        RunScopePreview: {
            /** Selected Nodes */
            selected_nodes: string[] | null;
            /** Order */
            order: string[];
        };
        /** RunScopeRequest */
        RunScopeRequest: {
            /** Selected Nodes */
            selected_nodes?: string[] | null;
        };
        /** RunSnapshot */
        RunSnapshot: {
            /** Run Id */
            run_id: string;
            /** Flow Id */
            flow_id: string;
            status: components["schemas"]["RunStatus"];
            mode: components["schemas"]["RunMode"];
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            /** Finished At */
            finished_at: string | null;
            /** Cost Usd */
            cost_usd: string;
            /** Tokens In */
            tokens_in: number;
            /** Tokens Out */
            tokens_out: number;
            node_counts: components["schemas"]["NodeCounts"];
            /** Content Hash */
            content_hash: string;
            /** Definition Changed */
            definition_changed: boolean;
            /** Waits */
            waits: components["schemas"]["HumanWait"][];
            lineage: components["schemas"]["Lineage"] | null;
            /** Dataset Item Id */
            dataset_item_id?: string | null;
            /** Selected Nodes */
            selected_nodes?: string[] | null;
            /** Start Node */
            start_node?: string | null;
            /** End Node */
            end_node?: string | null;
            /** Series Id */
            series_id?: string | null;
            /** Experiment Id */
            experiment_id?: string | null;
            /** Arm Id */
            arm_id?: string | null;
            /** Execution Id */
            execution_id: string;
            context: components["schemas"]["RunContext"] | null;
            /** Node Outputs */
            node_outputs?: {
                [key: string]: components["schemas"]["JsonValue"];
            };
            spec_version: components["schemas"]["SpecVersionInfo"];
            input_ref: components["schemas"]["ValueRef"] | null;
            output_ref: components["schemas"]["ValueRef"] | null;
            error: components["schemas"]["RunError"] | null;
            /** Seed */
            seed: number | null;
            /** Cassette Id */
            cassette_id: string | null;
            /** Catalog Snapshot At */
            catalog_snapshot_at: string | null;
            effective_config: components["schemas"]["JsonObject"];
            /** Config Hash */
            config_hash: string;
            limits: components["schemas"]["Limits"] | null;
            /** Trace Id */
            trace_id: string | null;
            /** Order */
            order: string[];
            /** Executions */
            executions: components["schemas"]["NodeExecution"][];
            /** Human Answers */
            human_answers: components["schemas"]["HumanAnswerStatus"][];
            /** Last Seq */
            last_seq: number;
        };
        /** @enum {string} */
        RunSort: "started_at" | "deadline_at";
        /** RunStartRequest */
        RunStartRequest: {
            /** Flow Id */
            flow_id: string;
            /**
             * At
             * @default working
             */
            at: string;
            mode: components["schemas"]["RunMode"];
            context?: components["schemas"]["RunContext"] | null;
            input?: components["schemas"]["JsonValue"];
            /** Dataset Item Id */
            dataset_item_id?: string | null;
            /** Selected Nodes */
            selected_nodes?: string[] | null;
            /** Start Node */
            start_node?: string | null;
            /** End Node */
            end_node?: string | null;
            /** Node Outputs */
            node_outputs?: {
                [key: string]: components["schemas"]["JsonValue"];
            };
            /** Cassette Id */
            cassette_id?: string | null;
            /** Human Answers */
            human_answers?: components["schemas"]["ScriptedAnswer"][] | null;
        };
        /** RunStarted */
        RunStarted: {
            /** Run Id */
            run_id: string;
            status: components["schemas"]["RunStatus"];
            /** Content Hash */
            content_hash: string;
            /** Spec Version Id */
            spec_version_id: string;
            /** Last Seq */
            last_seq: number;
            /** Ui Url */
            ui_url: string;
            /**
             * Warnings
             * @default []
             */
            warnings: components["schemas"]["Problem"][];
        };
        /** RunStartedEvent */
        RunStartedEvent: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "run_started";
            /** Flow Id */
            flow_id: string;
            /** Content Hash */
            content_hash: string;
            mode: components["schemas"]["RunMode"];
            /** Order */
            order: string[];
            input_ref: components["schemas"]["ValueRef"] | null;
        };
        /** @enum {string} */
        RunStatus: "queued" | "running" | "suspended" | "completed" | "failed" | "cancelled";
        /** RunSummary */
        RunSummary: {
            /** Run Id */
            run_id: string;
            /** Flow Id */
            flow_id: string;
            status: components["schemas"]["RunStatus"];
            mode: components["schemas"]["RunMode"];
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            /** Finished At */
            finished_at: string | null;
            /** Cost Usd */
            cost_usd: string;
            /** Tokens In */
            tokens_in: number;
            /** Tokens Out */
            tokens_out: number;
            node_counts: components["schemas"]["NodeCounts"];
            /** Content Hash */
            content_hash: string;
            /** Definition Changed */
            definition_changed: boolean;
            /** Waits */
            waits: components["schemas"]["HumanWait"][];
            lineage: components["schemas"]["Lineage"] | null;
            /** Dataset Item Id */
            dataset_item_id?: string | null;
            /** Selected Nodes */
            selected_nodes?: string[] | null;
            /** Start Node */
            start_node?: string | null;
            /** End Node */
            end_node?: string | null;
            /** Series Id */
            series_id?: string | null;
            /** Experiment Id */
            experiment_id?: string | null;
            /** Arm Id */
            arm_id?: string | null;
        };
        /** RunSuspended */
        RunSuspended: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Run Id */
            run_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "run_suspended";
            address: components["schemas"]["ExecutionAddress"];
        };
        /** ScriptedAnswer */
        ScriptedAnswer: {
            address: components["schemas"]["ExecutionAddress"];
            /**
             * Attempt
             * @default 1
             */
            attempt: number;
            payload: components["schemas"]["JsonValue"];
        };
        /** SecretBinding */
        SecretBinding: {
            /** Name */
            name: string;
            /** Ref */
            ref: string;
        };
        /** SecretHeader */
        SecretHeader: {
            /** Name */
            name: string;
            /** Value */
            value: string;
        };
        /** @enum {string} */
        SecretScope: "provider" | "tool" | "mcp_server";
        /** SecretSettingWrite */
        SecretSettingWrite: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "secret";
            /**
             * Secret
             * Format: password
             */
            secret: string;
        };
        /** @enum {string} */
        SecretSource: "environment" | "dotenv";
        /** SecretStatus */
        SecretStatus: {
            /** Name */
            name: string;
            /** Env Var */
            env_var: string;
            /** Declared By */
            declared_by: string;
            scope: components["schemas"]["SecretScope"];
            /** Declared In */
            declared_in: string;
            /** Setting Key */
            setting_key: string;
            source: components["schemas"]["SecretSource"] | null;
            /** Masked */
            masked: string | null;
            /** Set */
            set: boolean;
        };
        /** SeriesApproveBody */
        SeriesApproveBody: {
            /** Cap Usd */
            cap_usd?: number | string | null;
        };
        /** SeriesCancelBody */
        SeriesCancelBody: {
            /** Reason */
            reason?: string | null;
        };
        /** SeriesCaseRow */
        SeriesCaseRow: {
            /** Name */
            name: string;
            split: components["schemas"]["SeriesSplit"];
            /** Tags */
            tags: {
                [key: string]: string;
            };
            /** Variants */
            variants: components["schemas"]["VariantTally"][];
            /** Usd */
            usd: string;
            /** Failing */
            failing: boolean;
            /** Divergent */
            divergent: boolean;
            /** Attempts */
            attempts: components["schemas"]["AttemptView"][];
        };
        /** SeriesDetailView */
        SeriesDetailView: {
            /** Series Id */
            series_id: string;
            origin: components["schemas"]["SeriesOrigin"];
            /** Flow Id */
            flow_id: string | null;
            /** Dataset Id */
            dataset_id: string;
            question: components["schemas"]["QuestionKind"];
            on: components["schemas"]["SeriesSplit"];
            /** Cases */
            cases: number;
            /** Repeats */
            repeats: number;
            /** Variants */
            variants: string[];
            status: components["schemas"]["SeriesStatus"];
            progress: components["schemas"]["SeriesProgress"];
            spend: components["schemas"]["SeriesSpend"];
            verdict: components["schemas"]["SeriesVerdict"] | null;
            /** Waits */
            waits: number;
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            /** Finished At */
            finished_at: string | null;
            pause?: components["schemas"]["SeriesPause"] | null;
            question_detail: components["schemas"]["QuestionView"];
            /** Checks */
            checks: components["schemas"]["CheckView"][];
            matrix: components["schemas"]["SeriesMatrix"];
            /** Stability */
            stability: components["schemas"]["StabilityRow"][];
            /** Contrasts */
            contrasts: components["schemas"]["Contrast"][];
            /** Thresholds */
            thresholds: components["schemas"]["ThresholdCell"][];
            /** Aggregates */
            aggregates: components["schemas"]["VariantAggregates"][];
            launch: components["schemas"]["LaunchPlan"];
            /** Needs Approval */
            needs_approval: boolean;
            /** Approved By */
            approved_by: string | null;
            /** Finding Path */
            finding_path: string | null;
            /** Error */
            error: string | null;
        };
        SeriesEvent: components["schemas"]["SeriesStatusEvent"] | components["schemas"]["AttemptFinishedEvent"] | components["schemas"]["SeriesFinishedEvent"];
        /** SeriesFinishedEvent */
        SeriesFinishedEvent: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Series Id */
            series_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "series_finished";
            status: components["schemas"]["SeriesStatus"];
            verdict: components["schemas"]["VerdictState"] | null;
        };
        /** SeriesGetResult */
        SeriesGetResult: {
            series: components["schemas"]["SeriesDetailView"];
            /** Cases */
            cases: components["schemas"]["SeriesCaseRow"][] | null;
            /** Hidden Cases */
            hidden_cases: number;
        };
        /** SeriesMatrix */
        SeriesMatrix: {
            /** Columns */
            columns: components["schemas"]["MetricColumn"][];
            /** Rows */
            rows: components["schemas"]["MatrixRow"][];
        };
        SeriesOrigin: components["schemas"]["ExperimentOrigin"] | components["schemas"]["LookOrigin"];
        /** SeriesPause */
        SeriesPause: {
            reason: components["schemas"]["ApprovalReason"];
            /** Spent Usd */
            spent_usd: string;
        };
        /** SeriesProgress */
        SeriesProgress: {
            /** Done */
            done: number;
            /** Total */
            total: number;
        };
        /** SeriesProgressEvent */
        SeriesProgressEvent: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Tree Hash */
            tree_hash: string;
            /** Series Id */
            series_id: string;
            /** Experiment Id */
            experiment_id: string | null;
            /** Flow Id */
            flow_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "series_progress";
            /** Done */
            done: number;
            /** Total */
            total: number;
            /** Spend Usd */
            spend_usd: string;
        };
        /** SeriesSpend */
        SeriesSpend: {
            /** Usd */
            usd: string;
            /** Cap Usd */
            cap_usd: string;
            /**
             * Unpriced Attempts
             * @default 0
             */
            unpriced_attempts: number;
        };
        /**
         * SeriesSplit
         * @enum {string}
         */
        SeriesSplit: "dev" | "holdout";
        /** SeriesStartRequest */
        SeriesStartRequest: {
            /** @default dev */
            on: components["schemas"]["SeriesSplit"];
            /** Cases */
            cases?: number | null;
            /** Repeats */
            repeats?: number | null;
            /** Cap Usd */
            cap_usd?: number | string | null;
            /** Experiment Id */
            experiment_id?: string | null;
            look?: components["schemas"]["LookTarget"] | null;
            client_op_id?: components["schemas"]["Ulid"] | null;
        };
        /** SeriesStarted */
        SeriesStarted: {
            /** Series Id */
            series_id: string;
            origin: components["schemas"]["SeriesOrigin"];
            /** Flow Id */
            flow_id: string | null;
            /** Dataset Id */
            dataset_id: string;
            question: components["schemas"]["QuestionKind"];
            on: components["schemas"]["SeriesSplit"];
            /** Cases */
            cases: number;
            /** Repeats */
            repeats: number;
            /** Variants */
            variants: string[];
            status: components["schemas"]["SeriesStatus"];
            progress: components["schemas"]["SeriesProgress"];
            spend: components["schemas"]["SeriesSpend"];
            verdict: components["schemas"]["SeriesVerdict"] | null;
            /** Waits */
            waits: number;
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            /** Finished At */
            finished_at: string | null;
            pause?: components["schemas"]["SeriesPause"] | null;
            launch: components["schemas"]["LaunchPlan"];
        };
        /** SeriesStartedEvent */
        SeriesStartedEvent: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Tree Hash */
            tree_hash: string;
            /** Series Id */
            series_id: string;
            /** Experiment Id */
            experiment_id: string | null;
            /** Flow Id */
            flow_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "series_started";
            status: components["schemas"]["SeriesStatus"];
            /** Total */
            total: number;
        };
        /**
         * SeriesStatus
         * @enum {string}
         */
        SeriesStatus: "awaiting_approval" | "running" | "waiting_human" | "done" | "cancelled" | "failed";
        /** SeriesStatusChanged */
        SeriesStatusChanged: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Tree Hash */
            tree_hash: string;
            /** Series Id */
            series_id: string;
            /** Experiment Id */
            experiment_id: string | null;
            /** Flow Id */
            flow_id: string | null;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "series_status_changed";
            status: components["schemas"]["SeriesStatus"];
            previous: components["schemas"]["SeriesStatus"] | null;
        };
        /** SeriesStatusEvent */
        SeriesStatusEvent: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Series Id */
            series_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "series_status";
            status: components["schemas"]["SeriesStatus"];
        };
        /** SeriesSummaryView */
        SeriesSummaryView: {
            /** Series Id */
            series_id: string;
            origin: components["schemas"]["SeriesOrigin"];
            /** Flow Id */
            flow_id: string | null;
            /** Dataset Id */
            dataset_id: string;
            question: components["schemas"]["QuestionKind"];
            on: components["schemas"]["SeriesSplit"];
            /** Cases */
            cases: number;
            /** Repeats */
            repeats: number;
            /** Variants */
            variants: string[];
            status: components["schemas"]["SeriesStatus"];
            progress: components["schemas"]["SeriesProgress"];
            spend: components["schemas"]["SeriesSpend"];
            verdict: components["schemas"]["SeriesVerdict"] | null;
            /** Waits */
            waits: number;
            /**
             * Started At
             * Format: date-time
             */
            started_at: string;
            /** Finished At */
            finished_at: string | null;
            pause?: components["schemas"]["SeriesPause"] | null;
        };
        /** SeriesVerdict */
        SeriesVerdict: {
            state: components["schemas"]["VerdictState"];
            reason: components["schemas"]["VerdictReason"] | null;
            /** Text */
            text: string;
        };
        /** ServerStatus */
        ServerStatus: {
            /**
             * Checked At
             * Format: date-time
             */
            checked_at: string;
            /** Checks */
            checks: components["schemas"]["StatusCheck"][];
        };
        /** SettingDeleted */
        SettingDeleted: {
            scope: components["schemas"]["SettingScope"];
            /** Key */
            key: string;
            /** Deleted */
            deleted: boolean;
        };
        SettingKeyText: string;
        /** @enum {string} */
        SettingKind: "secret" | "value";
        /** @enum {string} */
        SettingScope: "studio" | "project";
        /** SettingView */
        SettingView: {
            scope: components["schemas"]["SettingScope"];
            key: components["schemas"]["SettingKeyText"];
            kind: components["schemas"]["SettingKind"];
            value?: components["schemas"]["JsonValue"];
            /** Masked */
            masked?: string | null;
            /** Env Var */
            env_var?: string | null;
            /**
             * Updated At
             * Format: date-time
             */
            updated_at: string;
        };
        SettingWrite: components["schemas"]["ValueSettingWrite"] | components["schemas"]["SecretSettingWrite"];
        /**
         * Severity
         * @enum {string}
         */
        Severity: "error" | "warning";
        /** SlotProvenance */
        SlotProvenance: {
            /** From */
            from: string;
            /** Need Id */
            need_id: string | null;
            /** Kind */
            kind: string;
        };
        /** SlotRange */
        SlotRange: {
            /** Slot */
            slot: string;
            /** Message Index */
            message_index: number;
            /** Part Index */
            part_index: number;
            /** Offset */
            offset: number;
            /** Length */
            length: number;
        };
        /** SpecActor */
        SpecActor: {
            kind: components["schemas"]["ActorKind"];
            /** Id */
            id: string | null;
        };
        SpecEvent: components["schemas"]["FilesChanged"] | components["schemas"]["DiagnosticsChanged"] | components["schemas"]["SpecResync"] | components["schemas"]["SeriesStartedEvent"] | components["schemas"]["SeriesProgressEvent"] | components["schemas"]["SeriesStatusChanged"] | components["schemas"]["FindingWritten"] | components["schemas"]["ExperimentChanged"];
        /**
         * SpecKind
         * @enum {string}
         */
        SpecKind: "Project" | "Type" | "Flow" | "Node" | "Dataset" | "Experiment" | "Inference" | "Agent" | "Tool" | "McpServer" | "Finding";
        /** @enum {string} */
        SpecOrigin: "working_copy" | "release";
        /** SpecResync */
        SpecResync: {
            /** Seq */
            seq: number;
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Tree Hash */
            tree_hash: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "resync";
            reason: components["schemas"]["ResyncReason"];
        };
        /** SpecSchema */
        SpecSchema: {
            kind: components["schemas"]["SpecKind"];
            /** Path */
            path: string;
            json_schema: components["schemas"]["JsonObject"];
            /** Variants */
            variants: {
                [key: string]: components["schemas"]["JsonObject"];
            };
        };
        /** SpecSchemaCatalog */
        SpecSchemaCatalog: {
            /** Dialect */
            dialect: string;
            /** Schemas */
            schemas: components["schemas"]["SpecSchema"][];
        };
        /** SpecVersionInfo */
        SpecVersionInfo: {
            /** Id */
            id: string;
            /** Content Hash */
            content_hash: string;
            /** Release Hash */
            release_hash: string | null;
            /** Git Commit */
            git_commit: string | null;
            origin: components["schemas"]["SpecOrigin"];
            /** Sources */
            sources: {
                [key: string]: string;
            };
        };
        /** Stability */
        Stability: {
            /** Always */
            always: number;
            /** Never */
            never: number;
            /** Flaky */
            flaky: number;
        };
        /** StabilityRow */
        StabilityRow: {
            /** Variant Id */
            variant_id: string;
            /** Always */
            always: number;
            /** Never */
            never: number;
            /** Flaky */
            flaky: number;
        };
        /**
         * StatMethod
         * @enum {string}
         */
        StatMethod: "wilson" | "kish_wilson" | "beta_binomial" | "t_case_means" | "bca_case_means" | "bootstrap_ratio" | "bootstrap_quantile" | "exact_sign" | "paired_t" | "paired_bca" | "paired_bootstrap_ratio" | "paired_bootstrap_quantile";
        /** StatusCheck */
        StatusCheck: {
            id: components["schemas"]["StatusCheckId"];
            state: components["schemas"]["StatusState"];
            /** Counts */
            counts: {
                [key: string]: components["schemas"]["Count"];
            };
            names: components["schemas"]["StatusNames"];
        };
        /** @enum {string} */
        StatusCheckId: "database" | "engine" | "project" | "model_keys";
        StatusNames: string[];
        /** @enum {string} */
        StatusState: "ok" | "warning" | "error";
        /** @enum {string} */
        StructuredMode: "tool" | "native" | "prompted";
        /** SubagentSpec */
        SubagentSpec: {
            /** Name */
            name: string;
            /** Description */
            description: string;
            /** Agent */
            agent: string;
            /** Inference */
            inference: string;
        };
        /**
         * SubjectKind
         * @enum {string}
         */
        SubjectKind: "flow" | "range" | "arm";
        /** SubjectView */
        SubjectView: {
            kind: components["schemas"]["SubjectKind"];
            /** Flow Id */
            flow_id: string | null;
            /** Arm Id */
            arm_id: string | null;
            /** From Node */
            from_node: string | null;
            /** To Node */
            to_node: string | null;
        };
        /** SwitchCase */
        SwitchCase: {
            /** Node */
            node?: string | null;
            /** Bind */
            bind?: components["schemas"]["FieldBinding"][] | null;
        };
        /** SwitchNodeSpec */
        SwitchNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "switch";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** On */
            on: string;
            /** Cases */
            cases: {
                [key: string]: components["schemas"]["SwitchCase"];
            };
            /** Out */
            out: components["schemas"]["FieldDecl"][];
        };
        /** @enum {string} */
        SyncState: "ok" | "quarantined" | "unreadable";
        /** TemplatePrompt */
        TemplatePrompt: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "template";
            level: components["schemas"]["PromptLevelText"];
            /** Template */
            template: string;
            /** Partials */
            partials?: {
                [key: string]: string;
            };
        };
        /** @enum {string} */
        TerminalRunStatus: "completed" | "failed" | "cancelled";
        /** ThresholdCell */
        ThresholdCell: {
            /** Metric */
            metric: string;
            /** Variant Id */
            variant_id: string;
            /**
             * Bound
             * @enum {string}
             */
            bound: "above" | "below";
            /** Threshold */
            threshold: number;
            /** Margin */
            margin: number;
            estimate: components["schemas"]["Estimate"];
            verdict: components["schemas"]["CellVerdict"];
        };
        TimeoutPolicy: components["schemas"]["FailOnTimeout"] | components["schemas"]["DefaultOnTimeout"] | components["schemas"]["EscalateOnTimeout"];
        /** ToolApprovalSpec */
        ToolApprovalSpec: {
            /** Tools */
            tools: string[];
            /** Assignee */
            assignee: string;
            /** Timeout Seconds */
            timeout_seconds: number;
            on_timeout: components["schemas"]["TimeoutPolicy"];
        };
        /** @enum {string} */
        ToolKind: "tool" | "mcp_tool" | "subagent";
        /** ToolNodeSpec */
        ToolNodeSpec: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Node";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            node: "tool";
            /** Description */
            description: string;
            limits?: components["schemas"]["Limits"] | null;
            /** Tool */
            tool: string;
            /** In */
            in?: components["schemas"]["FieldBinding"][];
        };
        /**
         * TrustLevel
         * @enum {string}
         */
        TrustLevel: "trusted" | "untrusted";
        /** TrustPolicy */
        TrustPolicy: {
            default_in: components["schemas"]["TrustLevel"];
        };
        /** TypeDetail */
        TypeDetail: {
            /** Type Id */
            type_id: string;
            /** Path */
            path: string;
            /** File Hash */
            file_hash: string;
            spec: components["schemas"]["TypeSpec"];
            json_schema: components["schemas"]["JsonValue"];
            /** Enum Values */
            enum_values: components["schemas"]["EnumValue"][];
        };
        /** @enum {string} */
        TypeKind: "record" | "enum" | "union" | "id" | "value";
        TypeRefText: string;
        TypeSpec: components["schemas"]["RecordType"] | components["schemas"]["EnumType"] | components["schemas"]["UnionType"] | components["schemas"]["IdType"] | components["schemas"]["ValueType"];
        /** TypeSummary */
        TypeSummary: {
            /** Type Id */
            type_id: string;
            /** Path */
            path: string;
            kind: components["schemas"]["TypeKind"];
            usage_count: components["schemas"]["Count"];
            /**
             * Status
             * @enum {string}
             */
            status: "ok" | "invalid";
        };
        Ulid: string;
        /** UnionType */
        UnionType: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Type";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "union";
            /** Description */
            description: string;
            /** @default none */
            pii: components["schemas"]["PiiClass"];
            /** Discriminator */
            discriminator: string;
            /** Variants */
            variants: components["schemas"]["UnionVariant"][];
        };
        /** UnionVariant */
        UnionVariant: {
            /** Name */
            name: string;
            /** Description */
            description: string;
            /** Fields */
            fields?: components["schemas"]["FieldDecl"][];
        };
        /** @enum {string} */
        ValueBase: "Text" | "Int" | "Float" | "Bool" | "Date" | "DateTime";
        ValueRef: components["schemas"]["InlineValue"] | components["schemas"]["BlobValue"];
        /** ValueSettingWrite */
        ValueSettingWrite: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            kind: "value";
            value: components["schemas"]["JsonValue"];
        };
        /** ValueType */
        ValueType: {
            /**
             * Apiversion
             * @constant
             */
            apiVersion: "aqven/v1";
            /**
             * Kind
             * @constant
             */
            kind: "Type";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "value";
            /** Description */
            description: string;
            /** @default none */
            pii: components["schemas"]["PiiClass"];
            base: components["schemas"]["ValueBase"];
            /** Maxlength */
            maxLength?: number | null;
            /** Maxitems */
            maxItems?: number | null;
            /** Minimum */
            minimum?: number | null;
            /** Maximum */
            maximum?: number | null;
            /** Pattern */
            pattern?: string | null;
            /** Enum */
            enum?: string[] | null;
        };
        /** VariantAggregates */
        VariantAggregates: {
            /** Variant Id */
            variant_id: string;
            role: components["schemas"]["VariantRole"];
            /** Cases */
            cases: number;
            /** Attempts */
            attempts: number;
            /** Counted */
            counted: number;
            /** Infra Errors */
            infra_errors: number;
            /** Spend Usd */
            spend_usd: string;
            /** Pass K */
            pass_k: number | null;
            /** Icc */
            icc: number | null;
            stability: components["schemas"]["Stability"] | null;
            /** Metrics */
            metrics: {
                [key: string]: components["schemas"]["Estimate"];
            };
            /** Runtime Checks */
            runtime_checks: {
                [key: string]: components["schemas"]["Estimate"];
            };
            /** Models */
            models: string[];
        };
        VariantRef: string;
        /**
         * VariantRole
         * @enum {string}
         */
        VariantRole: "baseline" | "candidate" | "other";
        /** VariantSlot */
        VariantSlot: {
            /** On */
            on: string;
            /** Cases */
            cases: {
                [key: string]: components["schemas"]["VariantRef"];
            };
            default?: components["schemas"]["VariantRef"] | null;
        };
        /** VariantTally */
        VariantTally: {
            /** Variant Id */
            variant_id: string;
            /** Passed */
            passed: number;
            /** Total */
            total: number;
            /** Failed Checks */
            failed_checks: string[];
            /** Usd */
            usd: string;
        };
        /** VariantView */
        VariantView: {
            /** Variant Id */
            variant_id: string;
            /** Arm Id */
            arm_id: string | null;
            role: components["schemas"]["VariantRole"];
            /** Assignments */
            assignments: components["schemas"]["AssignmentView"][];
        };
        /**
         * VerdictReason
         * @enum {string}
         */
        VerdictReason: "below_mde" | "uninformative" | "no_discordance" | "compute_confounded" | "inputs_changed" | "infra_errors" | "no_data" | "budget_cut" | "cancelled" | "dev_split" | "judge_not_validated";
        /**
         * VerdictState
         * @enum {string}
         */
        VerdictState: "confirmed" | "refuted" | "inconclusive" | "invalid" | "signal";
        /** @enum {string} */
        WaitKind: "form" | "tool_approval";
        /** @enum {string} */
        WaitState: "waiting" | "resolved" | "timed_out";
        /** @enum {string} */
        aqven__runtime__vocabulary__PromptRole: "system" | "user" | "assistant" | "tool";
        /** @enum {integer} */
        aqven__server__resources__PromptLevel: 1 | 2 | 3;
        /**
         * PromptLevel
         * @enum {integer}
         */
        aqven__spec__names__PromptLevel: 1 | 2 | 3;
        /** @enum {string} */
        aqven__spec__prompts__PromptRole: "system" | "user" | "assistant";
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type SchemaAbsoluteCodeRef = components['schemas']['AbsoluteCodeRef'];
export type SchemaActorKind = components['schemas']['ActorKind'];
export type SchemaAgentBackendKind = components['schemas']['AgentBackendKind'];
export type SchemaAgentModel = components['schemas']['AgentModel'];
export type SchemaAgentOutputSpec = components['schemas']['AgentOutputSpec'];
export type SchemaAgentRefView = components['schemas']['AgentRefView'];
export type SchemaAgentSpec = components['schemas']['AgentSpec'];
export type SchemaAllowedSetMember = components['schemas']['AllowedSetMember'];
export type SchemaAllowedSetMode = components['schemas']['AllowedSetMode'];
export type SchemaAllowedSetSpec = components['schemas']['AllowedSetSpec'];
export type SchemaApiError = components['schemas']['ApiError'];
export type SchemaApiErrorCode = components['schemas']['ApiErrorCode'];
export type SchemaApprovalDecision = components['schemas']['ApprovalDecision'];
export type SchemaApprovalReason = components['schemas']['ApprovalReason'];
export type SchemaApprovalResolver = components['schemas']['ApprovalResolver'];
export type SchemaArmFlowView = components['schemas']['ArmFlowView'];
export type SchemaArmStepView = components['schemas']['ArmStepView'];
export type SchemaArmView = components['schemas']['ArmView'];
export type SchemaAssigneeSource = components['schemas']['AssigneeSource'];
export type SchemaAssignmentView = components['schemas']['AssignmentView'];
export type SchemaAttempt = components['schemas']['Attempt'];
export type SchemaAttemptAction = components['schemas']['AttemptAction'];
export type SchemaAttemptCause = components['schemas']['AttemptCause'];
export type SchemaAttemptCauseKind = components['schemas']['AttemptCauseKind'];
export type SchemaAttemptFinishedEvent = components['schemas']['AttemptFinishedEvent'];
export type SchemaAttemptOutcome = components['schemas']['AttemptOutcome'];
export type SchemaAttemptView = components['schemas']['AttemptView'];
export type SchemaBlobMeta = components['schemas']['BlobMeta'];
export type SchemaBlobUploaded = components['schemas']['BlobUploaded'];
export type SchemaBlobValue = components['schemas']['BlobValue'];
export type SchemaBodyBlobUpload = components['schemas']['Body_blob_upload'];
export type SchemaBodyDatasetCsvImport = components['schemas']['Body_dataset_csv_import'];
export type SchemaBodyDatasetCsvPreview = components['schemas']['Body_dataset_csv_preview'];
export type SchemaBoundField = components['schemas']['BoundField'];
export type SchemaBuiltinEvaluator = components['schemas']['BuiltinEvaluator'];
export type SchemaBuiltinPolicy = components['schemas']['BuiltinPolicy'];
export type SchemaCallNodeSpec = components['schemas']['CallNodeSpec'];
export type SchemaCallOutcome = components['schemas']['CallOutcome'];
export type SchemaCancelRequest = components['schemas']['CancelRequest'];
export type SchemaCancelResult = components['schemas']['CancelResult'];
export type SchemaCapSource = components['schemas']['CapSource'];
export type SchemaCaseDraft = components['schemas']['CaseDraft'];
export type SchemaCaseFromRunRequest = components['schemas']['CaseFromRunRequest'];
export type SchemaCaseSelectionView = components['schemas']['CaseSelectionView'];
export type SchemaCellVerdict = components['schemas']['CellVerdict'];
export type SchemaChangeKind = components['schemas']['ChangeKind'];
export type SchemaChatApprovalReply = components['schemas']['ChatApprovalReply'];
export type SchemaChatApprovalRequested = components['schemas']['ChatApprovalRequested'];
export type SchemaChatApprovalResolved = components['schemas']['ChatApprovalResolved'];
export type SchemaChatBackendChoice = components['schemas']['ChatBackendChoice'];
export type SchemaChatBackendWrite = components['schemas']['ChatBackendWrite'];
export type SchemaChatCommand = components['schemas']['ChatCommand'];
export type SchemaChatDelivery = components['schemas']['ChatDelivery'];
export type SchemaChatEffort = components['schemas']['ChatEffort'];
export type SchemaChatErrorCode = components['schemas']['ChatErrorCode'];
export type SchemaChatErrorRaised = components['schemas']['ChatErrorRaised'];
export type SchemaChatEvent = components['schemas']['ChatEvent'];
export type SchemaChatFileChange = components['schemas']['ChatFileChange'];
export type SchemaChatFileEdit = components['schemas']['ChatFileEdit'];
export type SchemaChatFinishReason = components['schemas']['ChatFinishReason'];
export type SchemaChatMessageDelivered = components['schemas']['ChatMessageDelivered'];
export type SchemaChatMessageQueued = components['schemas']['ChatMessageQueued'];
export type SchemaChatMessageRequest = components['schemas']['ChatMessageRequest'];
export type SchemaChatModel = components['schemas']['ChatModel'];
export type SchemaChatModelCatalog = components['schemas']['ChatModelCatalog'];
export type SchemaChatModelEffort = components['schemas']['ChatModelEffort'];
export type SchemaChatPermissionMode = components['schemas']['ChatPermissionMode'];
export type SchemaChatReasoningDelta = components['schemas']['ChatReasoningDelta'];
export type SchemaChatSession = components['schemas']['ChatSession'];
export type SchemaChatSessionCreate = components['schemas']['ChatSessionCreate'];
export type SchemaChatSessionSettings = components['schemas']['ChatSessionSettings'];
export type SchemaChatState = components['schemas']['ChatState'];
export type SchemaChatStatus = components['schemas']['ChatStatus'];
export type SchemaChatStopReason = components['schemas']['ChatStopReason'];
export type SchemaChatTextDelta = components['schemas']['ChatTextDelta'];
export type SchemaChatToolCallArgsDelta = components['schemas']['ChatToolCallArgsDelta'];
export type SchemaChatToolCallFinished = components['schemas']['ChatToolCallFinished'];
export type SchemaChatToolCallStarted = components['schemas']['ChatToolCallStarted'];
export type SchemaChatToolStatus = components['schemas']['ChatToolStatus'];
export type SchemaChatTranscriptPage = components['schemas']['ChatTranscriptPage'];
export type SchemaChatTranscriptTurn = components['schemas']['ChatTranscriptTurn'];
export type SchemaChatTurnAccepted = components['schemas']['ChatTurnAccepted'];
export type SchemaChatTurnFinished = components['schemas']['ChatTurnFinished'];
export type SchemaChatTurnOrigin = components['schemas']['ChatTurnOrigin'];
export type SchemaChatTurnStarted = components['schemas']['ChatTurnStarted'];
export type SchemaChatUsage = components['schemas']['ChatUsage'];
export type SchemaChatUsageReported = components['schemas']['ChatUsageReported'];
export type SchemaCheckOutcome = components['schemas']['CheckOutcome'];
export type SchemaCheckSourceView = components['schemas']['CheckSourceView'];
export type SchemaCheckSpec = components['schemas']['CheckSpec'];
export type SchemaCheckView = components['schemas']['CheckView'];
export type SchemaCodeEvaluator = components['schemas']['CodeEvaluator'];
export type SchemaCodeFormat = components['schemas']['CodeFormat'];
export type SchemaCodeNodeSpec = components['schemas']['CodeNodeSpec'];
export type SchemaCodePolicy = components['schemas']['CodePolicy'];
export type SchemaCodePrompt = components['schemas']['CodePrompt'];
export type SchemaCodeToolSource = components['schemas']['CodeToolSource'];
export type SchemaCompileStatus = components['schemas']['CompileStatus'];
export type SchemaCompiledAgent = components['schemas']['CompiledAgent'];
export type SchemaCompiledAgentOutput = components['schemas']['CompiledAgentOutput'];
export type SchemaCompiledAllowedSet = components['schemas']['CompiledAllowedSet'];
export type SchemaCompiledBinding = components['schemas']['CompiledBinding'];
export type SchemaCompiledCallNode = components['schemas']['CompiledCallNode'];
export type SchemaCompiledCheck = components['schemas']['CompiledCheck'];
export type SchemaCompiledCodeNode = components['schemas']['CompiledCodeNode'];
export type SchemaCompiledDisplayFormatter = components['schemas']['CompiledDisplayFormatter'];
export type SchemaCompiledEvaluator = components['schemas']['CompiledEvaluator'];
export type SchemaCompiledFlow = components['schemas']['CompiledFlow'];
export type SchemaCompiledHumanNode = components['schemas']['CompiledHumanNode'];
export type SchemaCompiledInference = components['schemas']['CompiledInference'];
export type SchemaCompiledInferenceDisplay = components['schemas']['CompiledInferenceDisplay'];
export type SchemaCompiledJobWait = components['schemas']['CompiledJobWait'];
export type SchemaCompiledLlmNode = components['schemas']['CompiledLlmNode'];
export type SchemaCompiledLoopNode = components['schemas']['CompiledLoopNode'];
export type SchemaCompiledMapNode = components['schemas']['CompiledMapNode'];
export type SchemaCompiledMcpServer = components['schemas']['CompiledMcpServer'];
export type SchemaCompiledNarrowNode = components['schemas']['CompiledNarrowNode'];
export type SchemaCompiledNode = components['schemas']['CompiledNode'];
export type SchemaCompiledParallelNode = components['schemas']['CompiledParallelNode'];
export type SchemaCompiledPolicy = components['schemas']['CompiledPolicy'];
export type SchemaCompiledProject = components['schemas']['CompiledProject'];
export type SchemaCompiledPrompt = components['schemas']['CompiledPrompt'];
export type SchemaCompiledSwitchCase = components['schemas']['CompiledSwitchCase'];
export type SchemaCompiledSwitchNode = components['schemas']['CompiledSwitchNode'];
export type SchemaCompiledTool = components['schemas']['CompiledTool'];
export type SchemaCompiledToolNode = components['schemas']['CompiledToolNode'];
export type SchemaCompiledToolSource = components['schemas']['CompiledToolSource'];
export type SchemaCompiledVariantSlot = components['schemas']['CompiledVariantSlot'];
export type SchemaContractPredicate = components['schemas']['ContractPredicate'];
export type SchemaContrast = components['schemas']['Contrast'];
export type SchemaCostSource = components['schemas']['CostSource'];
export type SchemaCount = components['schemas']['Count'];
export type SchemaCsvColumn = components['schemas']['CsvColumn'];
export type SchemaCsvImportPreview = components['schemas']['CsvImportPreview'];
export type SchemaCsvMediaPreview = components['schemas']['CsvMediaPreview'];
export type SchemaCsvNodePreview = components['schemas']['CsvNodePreview'];
export type SchemaCsvRowPreview = components['schemas']['CsvRowPreview'];
export type SchemaCsvTemplate = components['schemas']['CsvTemplate'];
export type SchemaCsvTemplateField = components['schemas']['CsvTemplateField'];
export type SchemaCsvTemplateNode = components['schemas']['CsvTemplateNode'];
export type SchemaDataPolicy = components['schemas']['DataPolicy'];
export type SchemaDatasetCase = components['schemas']['DatasetCase'];
export type SchemaDatasetCreateRequest = components['schemas']['DatasetCreateRequest'];
export type SchemaDatasetDraftRequest = components['schemas']['DatasetDraftRequest'];
export type SchemaDatasetFile = components['schemas']['DatasetFile'];
export type SchemaDatasetRangePair = components['schemas']['DatasetRangePair'];
export type SchemaDatasetRangePreview = components['schemas']['DatasetRangePreview'];
export type SchemaDatasetRangeRequest = components['schemas']['DatasetRangeRequest'];
export type SchemaDatasetSummary = components['schemas']['DatasetSummary'];
export type SchemaDefaultOnTimeout = components['schemas']['DefaultOnTimeout'];
export type SchemaDegenerateReason = components['schemas']['DegenerateReason'];
export type SchemaDiagnostic = components['schemas']['Diagnostic'];
export type SchemaDiagnosticCode = components['schemas']['DiagnosticCode'];
export type SchemaDiagnosticsChanged = components['schemas']['DiagnosticsChanged'];
export type SchemaDisplayBadge = components['schemas']['DisplayBadge'];
export type SchemaDisplayCard = components['schemas']['DisplayCard'];
export type SchemaDisplayDocument = components['schemas']['DisplayDocument'];
export type SchemaDisplayElement = components['schemas']['DisplayElement'];
export type SchemaDisplayField = components['schemas']['DisplayField'];
export type SchemaDisplayFormatterSpec = components['schemas']['DisplayFormatterSpec'];
export type SchemaDisplayList = components['schemas']['DisplayList'];
export type SchemaDisplayMedia = components['schemas']['DisplayMedia'];
export type SchemaDisplaySection = components['schemas']['DisplaySection'];
export type SchemaDisplaySide = components['schemas']['DisplaySide'];
export type SchemaDisplayStatus = components['schemas']['DisplayStatus'];
export type SchemaDisplayText = components['schemas']['DisplayText'];
export type SchemaDisplayTone = components['schemas']['DisplayTone'];
export type SchemaDisplayVariableName = components['schemas']['DisplayVariableName'];
export type SchemaDisplayVariableRef = components['schemas']['DisplayVariableRef'];
export type SchemaDynamicLimits = components['schemas']['DynamicLimits'];
export type SchemaDynamicOutput = components['schemas']['DynamicOutput'];
export type SchemaDynamicSlot = components['schemas']['DynamicSlot'];
export type SchemaEffect = components['schemas']['Effect'];
export type SchemaEnumType = components['schemas']['EnumType'];
export type SchemaEnumValue = components['schemas']['EnumValue'];
export type SchemaEscalateOnTimeout = components['schemas']['EscalateOnTimeout'];
export type SchemaEstimate = components['schemas']['Estimate'];
export type SchemaEventCatalog = components['schemas']['EventCatalog'];
export type SchemaEventSchemas = components['schemas']['EventSchemas'];
export type SchemaExampleSpec = components['schemas']['ExampleSpec'];
export type SchemaExecutionAddress = components['schemas']['ExecutionAddress'];
export type SchemaExecutionDetail = components['schemas']['ExecutionDetail'];
export type SchemaExecutionStatus = components['schemas']['ExecutionStatus'];
export type SchemaExperimentChangeKind = components['schemas']['ExperimentChangeKind'];
export type SchemaExperimentChanged = components['schemas']['ExperimentChanged'];
export type SchemaExperimentDetailView = components['schemas']['ExperimentDetailView'];
export type SchemaExperimentFilesView = components['schemas']['ExperimentFilesView'];
export type SchemaExperimentOrigin = components['schemas']['ExperimentOrigin'];
export type SchemaExperimentPlan = components['schemas']['ExperimentPlan'];
export type SchemaExperimentSummaryView = components['schemas']['ExperimentSummaryView'];
export type SchemaFailOnTimeout = components['schemas']['FailOnTimeout'];
export type SchemaFamiliesDistinct = components['schemas']['FamiliesDistinct'];
export type SchemaFamilyDisjointFromInput = components['schemas']['FamilyDisjointFromInput'];
export type SchemaFieldBefore = components['schemas']['FieldBefore'];
export type SchemaFieldBinding = components['schemas']['FieldBinding'];
export type SchemaFieldDecl = components['schemas']['FieldDecl'];
export type SchemaFieldIr = components['schemas']['FieldIr'];
export type SchemaFieldName = components['schemas']['FieldName'];
export type SchemaFileChange = components['schemas']['FileChange'];
export type SchemaFileDetail = components['schemas']['FileDetail'];
export type SchemaFileEntry = components['schemas']['FileEntry'];
export type SchemaFileHash = components['schemas']['FileHash'];
export type SchemaFileKind = components['schemas']['FileKind'];
export type SchemaFileRef = components['schemas']['FileRef'];
export type SchemaFilesChanged = components['schemas']['FilesChanged'];
export type SchemaFindingWritten = components['schemas']['FindingWritten'];
export type SchemaFinishedExecutionStatus = components['schemas']['FinishedExecutionStatus'];
export type SchemaFlowDetail = components['schemas']['FlowDetail'];
export type SchemaFlowIr = components['schemas']['FlowIr'];
export type SchemaFlowSchemas = components['schemas']['FlowSchemas'];
export type SchemaFlowSpec = components['schemas']['FlowSpec'];
export type SchemaFlowSpecView = components['schemas']['FlowSpecView'];
export type SchemaFlowSummary = components['schemas']['FlowSummary'];
export type SchemaForkBase = components['schemas']['ForkBase'];
export type SchemaForkOverrides = components['schemas']['ForkOverrides'];
export type SchemaForkRequest = components['schemas']['ForkRequest'];
export type SchemaGuardrailView = components['schemas']['GuardrailView'];
export type SchemaHumanAnswerStatus = components['schemas']['HumanAnswerStatus'];
export type SchemaHumanNodeSpec = components['schemas']['HumanNodeSpec'];
export type SchemaHumanWait = components['schemas']['HumanWait'];
export type SchemaHumanWaitAttempt = components['schemas']['HumanWaitAttempt'];
export type SchemaHumanWaitDetail = components['schemas']['HumanWaitDetail'];
export type SchemaIdType = components['schemas']['IdType'];
export type SchemaIgnoredAnswer = components['schemas']['IgnoredAnswer'];
export type SchemaIncludePayloads = components['schemas']['IncludePayloads'];
export type SchemaIndexState = components['schemas']['IndexState'];
export type SchemaIndexStatus = components['schemas']['IndexStatus'];
export type SchemaInferenceChecksCaptured = components['schemas']['InferenceChecksCaptured'];
export type SchemaInferenceDisplaySpec = components['schemas']['InferenceDisplaySpec'];
export type SchemaInferenceInputCaptured = components['schemas']['InferenceInputCaptured'];
export type SchemaInferencePromptCaptured = components['schemas']['InferencePromptCaptured'];
export type SchemaInferenceSpec = components['schemas']['InferenceSpec'];
export type SchemaInlineValue = components['schemas']['InlineValue'];
export type SchemaInputField = components['schemas']['InputField'];
export type SchemaInputSource = components['schemas']['InputSource'];
export type SchemaItemError = components['schemas']['ItemError'];
export type SchemaItemRecovery = components['schemas']['ItemRecovery'];
export type SchemaItemRecoveryDecision = components['schemas']['ItemRecoveryDecision'];
export type SchemaJsonObject = components['schemas']['JsonObject'];
export type SchemaJsonParams = components['schemas']['JsonParams'];
export type SchemaJsonPointer = components['schemas']['JsonPointer'];
export type SchemaJsonSchema = components['schemas']['JsonSchema'];
export type SchemaJsonValue = components['schemas']['JsonValue'];
export type SchemaJudgeEvaluator = components['schemas']['JudgeEvaluator'];
export type SchemaLatestSeries = components['schemas']['LatestSeries'];
export type SchemaLaunchPlan = components['schemas']['LaunchPlan'];
export type SchemaLaunchRequest = components['schemas']['LaunchRequest'];
export type SchemaLimits = components['schemas']['Limits'];
export type SchemaLineage = components['schemas']['Lineage'];
export type SchemaLineageRelation = components['schemas']['LineageRelation'];
export type SchemaLiteralBinding = components['schemas']['LiteralBinding'];
export type SchemaLlmNodeSpec = components['schemas']['LlmNodeSpec'];
export type SchemaLocalUserView = components['schemas']['LocalUserView'];
export type SchemaLoginMethod = components['schemas']['LoginMethod'];
export type SchemaLoginState = components['schemas']['LoginState'];
export type SchemaLoginStatus = components['schemas']['LoginStatus'];
export type SchemaLookOrigin = components['schemas']['LookOrigin'];
export type SchemaLookTarget = components['schemas']['LookTarget'];
export type SchemaLoopExited = components['schemas']['LoopExited'];
export type SchemaLoopIterationFinished = components['schemas']['LoopIterationFinished'];
export type SchemaLoopNodeSpec = components['schemas']['LoopNodeSpec'];
export type SchemaLoopStopReason = components['schemas']['LoopStopReason'];
export type SchemaManualMissingRangeData = components['schemas']['ManualMissingRangeData'];
export type SchemaManualRangePair = components['schemas']['ManualRangePair'];
export type SchemaManualRangePreview = components['schemas']['ManualRangePreview'];
export type SchemaManualRangeRequest = components['schemas']['ManualRangeRequest'];
export type SchemaMapItemRecovered = components['schemas']['MapItemRecovered'];
export type SchemaMapNodeSpec = components['schemas']['MapNodeSpec'];
export type SchemaMatrixRow = components['schemas']['MatrixRow'];
export type SchemaMcpToolSource = components['schemas']['McpToolSource'];
export type SchemaMediaValue = components['schemas']['MediaValue'];
export type SchemaMessageOrigin = components['schemas']['MessageOrigin'];
export type SchemaMetricCell = components['schemas']['MetricCell'];
export type SchemaMetricColumn = components['schemas']['MetricColumn'];
export type SchemaMetricDirection = components['schemas']['MetricDirection'];
export type SchemaMetricKind = components['schemas']['MetricKind'];
export type SchemaMetricRole = components['schemas']['MetricRole'];
export type SchemaMetricUnit = components['schemas']['MetricUnit'];
export type SchemaMissingRangeData = components['schemas']['MissingRangeData'];
export type SchemaModelErrorDetails = components['schemas']['ModelErrorDetails'];
export type SchemaModelFamily = components['schemas']['ModelFamily'];
export type SchemaModelField = components['schemas']['ModelField'];
export type SchemaModelSettingsSpec = components['schemas']['ModelSettingsSpec'];
export type SchemaModelText = components['schemas']['ModelText'];
export type SchemaNarrowNodeSpec = components['schemas']['NarrowNodeSpec'];
export type SchemaNodeAgentModel = components['schemas']['NodeAgentModel'];
export type SchemaNodeAgentRuntime = components['schemas']['NodeAgentRuntime'];
export type SchemaNodeAnswerIgnored = components['schemas']['NodeAnswerIgnored'];
export type SchemaNodeAttemptDiscarded = components['schemas']['NodeAttemptDiscarded'];
export type SchemaNodeAttemptFailed = components['schemas']['NodeAttemptFailed'];
export type SchemaNodeBindingView = components['schemas']['NodeBindingView'];
export type SchemaNodeCode = components['schemas']['NodeCode'];
export type SchemaNodeCounts = components['schemas']['NodeCounts'];
export type SchemaNodeDetail = components['schemas']['NodeDetail'];
export type SchemaNodeDisplayPreview = components['schemas']['NodeDisplayPreview'];
export type SchemaNodeDisplaySource = components['schemas']['NodeDisplaySource'];
export type SchemaNodeExecution = components['schemas']['NodeExecution'];
export type SchemaNodeFinished = components['schemas']['NodeFinished'];
export type SchemaNodeKind = components['schemas']['NodeKind'];
export type SchemaNodeOutputDelta = components['schemas']['NodeOutputDelta'];
export type SchemaNodeProgress = components['schemas']['NodeProgress'];
export type SchemaNodePromptRef = components['schemas']['NodePromptRef'];
export type SchemaNodeResumed = components['schemas']['NodeResumed'];
export type SchemaNodeSchemas = components['schemas']['NodeSchemas'];
export type SchemaNodeSpec = components['schemas']['NodeSpec'];
export type SchemaNodeStarted = components['schemas']['NodeStarted'];
export type SchemaNodeSummary = components['schemas']['NodeSummary'];
export type SchemaNodeSuspended = components['schemas']['NodeSuspended'];
export type SchemaNodeValueShape = components['schemas']['NodeValueShape'];
export type SchemaNodeWaitEscalated = components['schemas']['NodeWaitEscalated'];
export type SchemaNodeWaitTimedOut = components['schemas']['NodeWaitTimedOut'];
export type SchemaOnFail = components['schemas']['OnFail'];
export type SchemaOnTimeoutAction = components['schemas']['OnTimeoutAction'];
export type SchemaOpenRouterRouting = components['schemas']['OpenRouterRouting'];
export type SchemaOutcomeClass = components['schemas']['OutcomeClass'];
export type SchemaOutcomePolicy = components['schemas']['OutcomePolicy'];
export type SchemaOutputField = components['schemas']['OutputField'];
export type SchemaOutputMode = components['schemas']['OutputMode'];
export type SchemaOutputModeSetting = components['schemas']['OutputModeSetting'];
export type SchemaOutputModeSource = components['schemas']['OutputModeSource'];
export type SchemaOutputPartKind = components['schemas']['OutputPartKind'];
export type SchemaOutputShape = components['schemas']['OutputShape'];
export type SchemaPageChatSession = components['schemas']['Page_ChatSession_'];
export type SchemaPageDatasetCase = components['schemas']['Page_DatasetCase_'];
export type SchemaPageDatasetSummary = components['schemas']['Page_DatasetSummary_'];
export type SchemaPageExperimentSummaryView = components['schemas']['Page_ExperimentSummaryView_'];
export type SchemaPageFileEntry = components['schemas']['Page_FileEntry_'];
export type SchemaPageFlowSummary = components['schemas']['Page_FlowSummary_'];
export type SchemaPagePromptSummary = components['schemas']['Page_PromptSummary_'];
export type SchemaPageRunEvent = components['schemas']['Page_RunEvent_'];
export type SchemaPageRunSummary = components['schemas']['Page_RunSummary_'];
export type SchemaPageSeriesSummaryView = components['schemas']['Page_SeriesSummaryView_'];
export type SchemaPageTypeSummary = components['schemas']['Page_TypeSummary_'];
export type SchemaPageStr = components['schemas']['Page_str_'];
export type SchemaParallelNodeSpec = components['schemas']['ParallelNodeSpec'];
export type SchemaParseStatus = components['schemas']['ParseStatus'];
export type SchemaPiiClass = components['schemas']['PiiClass'];
export type SchemaPiiDetector = components['schemas']['PiiDetector'];
export type SchemaPiiPolicy = components['schemas']['PiiPolicy'];
export type SchemaPolicyName = components['schemas']['PolicyName'];
export type SchemaPolicyRef = components['schemas']['PolicyRef'];
export type SchemaPresentationRequest = components['schemas']['PresentationRequest'];
export type SchemaPresentationResponse = components['schemas']['PresentationResponse'];
export type SchemaPresentationResult = components['schemas']['PresentationResult'];
export type SchemaPresentationTarget = components['schemas']['PresentationTarget'];
export type SchemaPreviewAttachment = components['schemas']['PreviewAttachment'];
export type SchemaPreviewMessage = components['schemas']['PreviewMessage'];
export type SchemaPreviewOutput = components['schemas']['PreviewOutput'];
export type SchemaPreviewTool = components['schemas']['PreviewTool'];
export type SchemaPreviewVariant = components['schemas']['PreviewVariant'];
export type SchemaProblem = components['schemas']['Problem'];
export type SchemaProblemCounts = components['schemas']['ProblemCounts'];
export type SchemaProjectInfo = components['schemas']['ProjectInfo'];
export type SchemaProjectPolicies = components['schemas']['ProjectPolicies'];
export type SchemaPromptAnalysis = components['schemas']['PromptAnalysis'];
export type SchemaPromptDelivery = components['schemas']['PromptDelivery'];
export type SchemaPromptDetail = components['schemas']['PromptDetail'];
export type SchemaPromptLevelInput = components['schemas']['PromptLevel-Input'];
export type SchemaPromptLevelText = components['schemas']['PromptLevelText'];
export type SchemaPromptPart = components['schemas']['PromptPart'];
export type SchemaPromptPartKind = components['schemas']['PromptPartKind'];
export type SchemaPromptPreview = components['schemas']['PromptPreview'];
export type SchemaPromptPreviewBody = components['schemas']['PromptPreviewBody'];
export type SchemaPromptSlot = components['schemas']['PromptSlot'];
export type SchemaPromptSource = components['schemas']['PromptSource'];
export type SchemaPromptSourceText = components['schemas']['PromptSourceText'];
export type SchemaPromptSummary = components['schemas']['PromptSummary'];
export type SchemaPromptTrace = components['schemas']['PromptTrace'];
export type SchemaPromptTraceMessage = components['schemas']['PromptTraceMessage'];
export type SchemaProviderCapabilitiesSpec = components['schemas']['ProviderCapabilitiesSpec'];
export type SchemaProviderKeyStatus = components['schemas']['ProviderKeyStatus'];
export type SchemaProviderKind = components['schemas']['ProviderKind'];
export type SchemaProviderLimits = components['schemas']['ProviderLimits'];
export type SchemaProviderNameField = components['schemas']['ProviderNameField'];
export type SchemaProviderSpec = components['schemas']['ProviderSpec'];
export type SchemaProviderText = components['schemas']['ProviderText'];
export type SchemaQuestionKind = components['schemas']['QuestionKind'];
export type SchemaQuestionView = components['schemas']['QuestionView'];
export type SchemaRateLimitMode = components['schemas']['RateLimitMode'];
export type SchemaReadyState = components['schemas']['ReadyState'];
export type SchemaRecommendation = components['schemas']['Recommendation'];
export type SchemaRecommendationReason = components['schemas']['RecommendationReason'];
export type SchemaRecordType = components['schemas']['RecordType'];
export type SchemaRefBinding = components['schemas']['RefBinding'];
export type SchemaRefText = components['schemas']['RefText'];
export type SchemaResearchBudgetView = components['schemas']['ResearchBudgetView'];
export type SchemaResearchBudgetWrite = components['schemas']['ResearchBudgetWrite'];
export type SchemaResearchSettings = components['schemas']['ResearchSettings'];
export type SchemaResolvedAllowedSet = components['schemas']['ResolvedAllowedSet'];
export type SchemaResolvedOutputMode = components['schemas']['ResolvedOutputMode'];
export type SchemaResponseTrace = components['schemas']['ResponseTrace'];
export type SchemaResumeOutcome = components['schemas']['ResumeOutcome'];
export type SchemaResumeRequest = components['schemas']['ResumeRequest'];
export type SchemaResumeResult = components['schemas']['ResumeResult'];
export type SchemaResyncReason = components['schemas']['ResyncReason'];
export type SchemaRetention = components['schemas']['Retention'];
export type SchemaRunBrief = components['schemas']['RunBrief'];
export type SchemaRunContext = components['schemas']['RunContext'];
export type SchemaRunContextKey = components['schemas']['RunContextKey'];
export type SchemaRunError = components['schemas']['RunError'];
export type SchemaRunEvent = components['schemas']['RunEvent'];
export type SchemaRunFinished = components['schemas']['RunFinished'];
export type SchemaRunForked = components['schemas']['RunForked'];
export type SchemaRunMode = components['schemas']['RunMode'];
export type SchemaRunResumed = components['schemas']['RunResumed'];
export type SchemaRunScopePreview = components['schemas']['RunScopePreview'];
export type SchemaRunScopeRequest = components['schemas']['RunScopeRequest'];
export type SchemaRunSnapshot = components['schemas']['RunSnapshot'];
export type SchemaRunSort = components['schemas']['RunSort'];
export type SchemaRunStartRequest = components['schemas']['RunStartRequest'];
export type SchemaRunStarted = components['schemas']['RunStarted'];
export type SchemaRunStartedEvent = components['schemas']['RunStartedEvent'];
export type SchemaRunStatus = components['schemas']['RunStatus'];
export type SchemaRunSummary = components['schemas']['RunSummary'];
export type SchemaRunSuspended = components['schemas']['RunSuspended'];
export type SchemaScriptedAnswer = components['schemas']['ScriptedAnswer'];
export type SchemaSecretBinding = components['schemas']['SecretBinding'];
export type SchemaSecretHeader = components['schemas']['SecretHeader'];
export type SchemaSecretScope = components['schemas']['SecretScope'];
export type SchemaSecretSettingWrite = components['schemas']['SecretSettingWrite'];
export type SchemaSecretSource = components['schemas']['SecretSource'];
export type SchemaSecretStatus = components['schemas']['SecretStatus'];
export type SchemaSeriesApproveBody = components['schemas']['SeriesApproveBody'];
export type SchemaSeriesCancelBody = components['schemas']['SeriesCancelBody'];
export type SchemaSeriesCaseRow = components['schemas']['SeriesCaseRow'];
export type SchemaSeriesDetailView = components['schemas']['SeriesDetailView'];
export type SchemaSeriesEvent = components['schemas']['SeriesEvent'];
export type SchemaSeriesFinishedEvent = components['schemas']['SeriesFinishedEvent'];
export type SchemaSeriesGetResult = components['schemas']['SeriesGetResult'];
export type SchemaSeriesMatrix = components['schemas']['SeriesMatrix'];
export type SchemaSeriesOrigin = components['schemas']['SeriesOrigin'];
export type SchemaSeriesPause = components['schemas']['SeriesPause'];
export type SchemaSeriesProgress = components['schemas']['SeriesProgress'];
export type SchemaSeriesProgressEvent = components['schemas']['SeriesProgressEvent'];
export type SchemaSeriesSpend = components['schemas']['SeriesSpend'];
export type SchemaSeriesSplit = components['schemas']['SeriesSplit'];
export type SchemaSeriesStartRequest = components['schemas']['SeriesStartRequest'];
export type SchemaSeriesStarted = components['schemas']['SeriesStarted'];
export type SchemaSeriesStartedEvent = components['schemas']['SeriesStartedEvent'];
export type SchemaSeriesStatus = components['schemas']['SeriesStatus'];
export type SchemaSeriesStatusChanged = components['schemas']['SeriesStatusChanged'];
export type SchemaSeriesStatusEvent = components['schemas']['SeriesStatusEvent'];
export type SchemaSeriesSummaryView = components['schemas']['SeriesSummaryView'];
export type SchemaSeriesVerdict = components['schemas']['SeriesVerdict'];
export type SchemaServerStatus = components['schemas']['ServerStatus'];
export type SchemaSettingDeleted = components['schemas']['SettingDeleted'];
export type SchemaSettingKeyText = components['schemas']['SettingKeyText'];
export type SchemaSettingKind = components['schemas']['SettingKind'];
export type SchemaSettingScope = components['schemas']['SettingScope'];
export type SchemaSettingView = components['schemas']['SettingView'];
export type SchemaSettingWrite = components['schemas']['SettingWrite'];
export type SchemaSeverity = components['schemas']['Severity'];
export type SchemaSlotProvenance = components['schemas']['SlotProvenance'];
export type SchemaSlotRange = components['schemas']['SlotRange'];
export type SchemaSpecActor = components['schemas']['SpecActor'];
export type SchemaSpecEvent = components['schemas']['SpecEvent'];
export type SchemaSpecKind = components['schemas']['SpecKind'];
export type SchemaSpecOrigin = components['schemas']['SpecOrigin'];
export type SchemaSpecResync = components['schemas']['SpecResync'];
export type SchemaSpecSchema = components['schemas']['SpecSchema'];
export type SchemaSpecSchemaCatalog = components['schemas']['SpecSchemaCatalog'];
export type SchemaSpecVersionInfo = components['schemas']['SpecVersionInfo'];
export type SchemaStability = components['schemas']['Stability'];
export type SchemaStabilityRow = components['schemas']['StabilityRow'];
export type SchemaStatMethod = components['schemas']['StatMethod'];
export type SchemaStatusCheck = components['schemas']['StatusCheck'];
export type SchemaStatusCheckId = components['schemas']['StatusCheckId'];
export type SchemaStatusNames = components['schemas']['StatusNames'];
export type SchemaStatusState = components['schemas']['StatusState'];
export type SchemaStructuredMode = components['schemas']['StructuredMode'];
export type SchemaSubagentSpec = components['schemas']['SubagentSpec'];
export type SchemaSubjectKind = components['schemas']['SubjectKind'];
export type SchemaSubjectView = components['schemas']['SubjectView'];
export type SchemaSwitchCase = components['schemas']['SwitchCase'];
export type SchemaSwitchNodeSpec = components['schemas']['SwitchNodeSpec'];
export type SchemaSyncState = components['schemas']['SyncState'];
export type SchemaTemplatePrompt = components['schemas']['TemplatePrompt'];
export type SchemaTerminalRunStatus = components['schemas']['TerminalRunStatus'];
export type SchemaThresholdCell = components['schemas']['ThresholdCell'];
export type SchemaTimeoutPolicy = components['schemas']['TimeoutPolicy'];
export type SchemaToolApprovalSpec = components['schemas']['ToolApprovalSpec'];
export type SchemaToolKind = components['schemas']['ToolKind'];
export type SchemaToolNodeSpec = components['schemas']['ToolNodeSpec'];
export type SchemaTrustLevel = components['schemas']['TrustLevel'];
export type SchemaTrustPolicy = components['schemas']['TrustPolicy'];
export type SchemaTypeDetail = components['schemas']['TypeDetail'];
export type SchemaTypeKind = components['schemas']['TypeKind'];
export type SchemaTypeRefText = components['schemas']['TypeRefText'];
export type SchemaTypeSpec = components['schemas']['TypeSpec'];
export type SchemaTypeSummary = components['schemas']['TypeSummary'];
export type SchemaUlid = components['schemas']['Ulid'];
export type SchemaUnionType = components['schemas']['UnionType'];
export type SchemaUnionVariant = components['schemas']['UnionVariant'];
export type SchemaValueBase = components['schemas']['ValueBase'];
export type SchemaValueRef = components['schemas']['ValueRef'];
export type SchemaValueSettingWrite = components['schemas']['ValueSettingWrite'];
export type SchemaValueType = components['schemas']['ValueType'];
export type SchemaVariantAggregates = components['schemas']['VariantAggregates'];
export type SchemaVariantRef = components['schemas']['VariantRef'];
export type SchemaVariantRole = components['schemas']['VariantRole'];
export type SchemaVariantSlot = components['schemas']['VariantSlot'];
export type SchemaVariantTally = components['schemas']['VariantTally'];
export type SchemaVariantView = components['schemas']['VariantView'];
export type SchemaVerdictReason = components['schemas']['VerdictReason'];
export type SchemaVerdictState = components['schemas']['VerdictState'];
export type SchemaWaitKind = components['schemas']['WaitKind'];
export type SchemaWaitState = components['schemas']['WaitState'];
export type SchemaAqvenRuntimeVocabularyPromptRole = components['schemas']['aqven__runtime__vocabulary__PromptRole'];
export type SchemaAqvenServerResourcesPromptLevel = components['schemas']['aqven__server__resources__PromptLevel'];
export type SchemaAqvenSpecNamesPromptLevel = components['schemas']['aqven__spec__names__PromptLevel'];
export type SchemaAqvenSpecPromptsPromptRole = components['schemas']['aqven__spec__prompts__PromptRole'];
export type $defs = Record<string, never>;
export interface operations {
    ready: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReadyState"];
                };
            };
        };
    };
    status_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServerStatus"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    project_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProjectInfo"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    research_budget_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResearchBudgetView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    research_budget_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResearchBudgetWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResearchBudgetView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    file_list: {
        parameters: {
            query?: {
                prefix?: string | null;
                kind?: components["schemas"]["FileKind"] | null;
                state?: components["schemas"]["SyncState"] | null;
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_FileEntry_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    file_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                path: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FileDetail"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    raw_get: {
        parameters: {
            query?: never;
            header?: {
                "if-none-match"?: string | null;
            };
            path: {
                path: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_list: {
        parameters: {
            query?: {
                status?: components["schemas"]["CompileStatus"] | null;
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_FlowSummary_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FlowDetail"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_spec: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FlowSpecView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_ir: {
        parameters: {
            query?: never;
            header?: {
                "if-none-match"?: string | null;
            };
            path: {
                flow_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FlowIr"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_schemas: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["FlowSchemas"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_run_scope: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RunScopeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunScopePreview"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_dataset_range: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DatasetRangeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DatasetRangePreview"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_manual_range: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ManualRangeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ManualRangePreview"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_nodes: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NodeSummary"][];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_node: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
                node_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NodeDetail"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_node_display_preview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
                node_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NodeDisplayPreview"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_node_prompt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
                node_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PromptDetail"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    flow_node_prompt_preview: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                flow_id: string;
                node_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PromptPreviewBody"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PromptPreview"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    prompt_list: {
        parameters: {
            query?: {
                flow_id?: string | null;
                level?: components["schemas"]["PromptLevel-Input"] | null;
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_PromptSummary_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    type_list: {
        parameters: {
            query?: {
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_TypeSummary_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    type_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                type_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TypeDetail"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_list: {
        parameters: {
            query?: {
                flow_id?: string | null;
                status?: components["schemas"]["RunStatus"] | null;
                mode?: components["schemas"]["RunMode"] | null;
                assignee?: string | null;
                parent_run_id?: string | null;
                deadline_before?: string | null;
                overdue?: boolean | null;
                since?: string | null;
                until?: string | null;
                sort?: components["schemas"]["RunSort"];
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_RunSummary_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_start: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RunStartRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunStarted"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunSnapshot"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_events: {
        parameters: {
            query?: {
                after_seq?: number;
            };
            header?: {
                "last-event-id"?: number | null;
            };
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": unknown;
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_event_log: {
        parameters: {
            query?: {
                after_seq?: number;
                limit?: number;
            };
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_RunEvent_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_executions: {
        parameters: {
            query?: {
                node_id?: string | null;
                status?: components["schemas"]["ExecutionStatus"] | null;
            };
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NodeExecution"][];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_executions_detail: {
        parameters: {
            query: {
                node_id: string;
                branch_key?: string | null;
                iteration?: number | null;
                item_index?: number | null;
                include_payloads?: components["schemas"]["IncludePayloads"];
            };
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExecutionDetail"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_presentation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PresentationRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PresentationResponse"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_resume: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ResumeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResumeResult"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_fork: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ForkRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RunForked"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    run_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                run_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CancelResult"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    spec_events: {
        parameters: {
            query?: {
                after_seq?: number;
            };
            header?: {
                "last-event-id"?: number | null;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": unknown;
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
        };
    };
    events_follow: {
        parameters: {
            query: {
                follow: string[];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": unknown;
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
        };
    };
    event_catalog: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventCatalog"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    spec_schema_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SpecSchemaCatalog"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    spec_schema_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                kind: components["schemas"]["SpecKind"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SpecSchema"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    blob_upload: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_blob_upload"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BlobUploaded"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    blob_meta: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                blob_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BlobMeta"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    blob_download: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                blob_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Partial Content */
            206: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Range Not Satisfiable */
            416: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    blob_head: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                blob_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Partial Content */
            206: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Range Not Satisfiable */
            416: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    provider_keys: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProviderKeyStatus"][];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    secret_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SecretStatus"][];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    local_user_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocalUserView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    setting_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scope: "studio" | "project";
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettingView"][];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    setting_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scope: "studio" | "project";
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettingView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    setting_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scope: "studio" | "project";
                key: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SettingWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettingView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    setting_delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scope: "studio" | "project";
                key: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SettingDeleted"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_list: {
        parameters: {
            query?: {
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_DatasetSummary_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DatasetCreateRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DatasetSummary"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                dataset_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DatasetSummary"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_cases: {
        parameters: {
            query?: {
                search?: string | null;
                split?: string | null;
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path: {
                dataset_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_DatasetCase_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_case_names: {
        parameters: {
            query?: {
                search?: string | null;
                split?: string | null;
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path: {
                dataset_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_str_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_case_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                dataset_id: string;
                case_name: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DatasetCase"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    case_from_run: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                dataset_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CaseFromRunRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CaseDraft"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_draft: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DatasetDraftRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DatasetFile"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_csv_template: {
        parameters: {
            query: {
                flow_id: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CsvTemplate"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_csv_preview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_dataset_csv_preview"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CsvImportPreview"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    dataset_csv_import: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": components["schemas"]["Body_dataset_csv_import"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DatasetSummary"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    experiment_list: {
        parameters: {
            query?: {
                flow_id?: string | null;
                question?: components["schemas"]["QuestionKind"] | null;
                failure_mode?: string | null;
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_ExperimentSummaryView_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    experiment_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                experiment_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExperimentDetailView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    experiment_arm: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                experiment_id: string;
                arm_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ArmFlowView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    series_launch_plan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                experiment_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LaunchRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LaunchPlan"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    series_list: {
        parameters: {
            query?: {
                experiment_id?: string | null;
                flow_id?: string | null;
                status?: components["schemas"]["SeriesStatus"] | null;
                cursor?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_SeriesSummaryView_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    series_start: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SeriesStartRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeriesStarted"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    series_get: {
        parameters: {
            query?: {
                wait_seconds?: number;
                include_cases?: boolean;
            };
            header?: never;
            path: {
                series_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeriesGetResult"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    series_cases: {
        parameters: {
            query?: {
                failures?: boolean;
                divergent?: boolean;
            };
            header?: never;
            path: {
                series_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeriesCaseRow"][];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    series_events: {
        parameters: {
            query?: {
                after_seq?: number;
            };
            header?: {
                "last-event-id"?: number | null;
            };
            path: {
                series_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": unknown;
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
        };
    };
    series_approve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                series_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["SeriesApproveBody"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeriesSummaryView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    series_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                series_id: string;
            };
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["SeriesCancelBody"] | null;
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeriesSummaryView"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_login_status: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginStatus"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_model_list: {
        parameters: {
            query?: {
                backend?: components["schemas"]["AgentBackendKind"] | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatModelCatalog"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_backend_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatBackendChoice"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_backend_put: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChatBackendWrite"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatBackendChoice"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_session_list: {
        parameters: {
            query?: {
                flow_id?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Page_ChatSession_"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_session_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChatSessionCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatSession"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_session_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatSession"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_session_close: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatSession"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_session_settings: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChatSessionSettings"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatSession"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_message_send: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChatMessageRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatTurnAccepted"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_events: {
        parameters: {
            query?: {
                after_seq?: number;
            };
            header?: {
                "last-event-id"?: number | null;
            };
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": unknown;
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_transcript: {
        parameters: {
            query?: {
                before_seq?: number | null;
                limit?: number;
            };
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatTranscriptPage"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_approval_answer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                approval_id: string;
                session_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ChatApprovalReply"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatSession"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    chat_interrupt: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                session_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChatSession"];
                };
            };
            /** @description Bad Request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unauthorized */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Forbidden */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Not Found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Precondition Failed */
            412: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Unprocessable Content */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Locked */
            423: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Internal Server Error */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
}
