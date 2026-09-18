export type LiveErrorFixture = { readonly status: number; readonly body: unknown }

export const liveNotFoundError: LiveErrorFixture = {
  "status": 404,
  "body": {
    "ok": false,
    "op": "flow_get",
    "code": "NOT_FOUND",
    "message": "flow no_such_flow is not in the project",
    "problems": [],
    "candidates": [],
    "conflict": null,
    "retry_after_ms": null
  }
}

export const liveConflictError: LiveErrorFixture = {
  "status": 409,
  "body": {
    "ok": false,
    "op": "run_resume",
    "code": "ALREADY_RESUMED",
    "message": "wait is already resolved by another answer",
    "problems": [],
    "candidates": [],
    "conflict": null,
    "retry_after_ms": null
  }
}

export const liveInvalidRequestError: LiveErrorFixture = {
  "status": 422,
  "body": {
    "ok": false,
    "op": "run_resume",
    "code": "REQUEST_INVALID",
    "message": "request failed validation",
    "problems": [
      {
        "path": [
          "body",
          "address"
        ],
        "code": "missing",
        "message": "Field required"
      },
      {
        "path": [
          "body",
          "payload"
        ],
        "code": "missing",
        "message": "Field required"
      },
      {
        "path": [
          "body",
          "client_op_id"
        ],
        "code": "missing",
        "message": "Field required"
      }
    ],
    "candidates": [],
    "conflict": null,
    "retry_after_ms": null
  }
}
