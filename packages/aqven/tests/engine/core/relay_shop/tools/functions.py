from typing import Final

from relay_shop.code.trace import mark
from relay_shop.types import Reply, Stamped

from aqven.runtime import JobDone, JobHandle, JobPending, JobPoll, ToolContext

POLLS: Final[dict[str, int]] = {}
READY_AFTER: Final = 2


async def stamp(ctx: ToolContext, text: str) -> Stamped:
    mark("stamp")
    response = await ctx.http.post("https://stamp.example/stamps", json={"text": text})
    response.raise_for_status()
    media = await ctx.blobs.put(text.encode(), "text/plain", "note.txt")
    return Stamped(
        text=str(response.json()["stamped"]),
        key=ctx.idempotency_key,
        blob_id=media.blob_id,
        token_tail=ctx.secret("token")[-2:],
    )


async def start_render(ctx: ToolContext, text: str) -> JobHandle:
    mark("render_started")
    return JobHandle(job_id=f"job-{text}", provider="painter")


async def poll_render(ctx: ToolContext, job: JobHandle) -> JobPoll[Reply]:
    POLLS[job.job_id] = POLLS.get(job.job_id, 0) + 1
    if POLLS[job.job_id] < READY_AFTER:
        return JobPending(progress=0.5)
    return JobDone[Reply](value=Reply(text=job.job_id))
