import base64
from collections.abc import Awaitable, Callable, Mapping
from typing import Annotated, Final

from pydantic import BaseModel, Field, StringConstraints

from aqven.runtime import JobDone, JobFailed, JobHandle, JobPending, JobPoll, ToolContext
from aqven.spec import Audio, Image, Locale, MediaValue, TenantId, Video
from lumen.types import (
    CustomerIdField,
    IssueStoreCreditOut,
    LookupOrderOut,
    Money,
    OrderIdField,
    ProductCategory,
    RenderClipOut,
    SearchKbOut,
    SynthesizeVoiceOut,
)

KB_SEARCH_URL: Final = "https://kb.lumen.example/v1/search"
ORDERS_URL: Final = "https://orders.lumen.example/v1/orders"
SPEECH_URL: Final = "https://api.openai.com/v1/audio/speech"
SPEECH_MODEL: Final = "gpt-4o-mini-tts"
SPEECH_VOICE: Final = "coral"
SPEECH_INSTRUCTIONS: Final = "Calm, friendly support agent. Language and accent: {locale}."
VIDEOS_URL: Final = "https://api.together.xyz/v2/videos"
CLIP_MODEL: Final = "google/veo-3.1"
CLIP_PROVIDER: Final = "together"
ORDERS_TOKEN: Final = "orders_token"
TOGETHER_API_KEY: Final = "together_api_key"
IDEMPOTENCY_HEADER: Final = "Idempotency-Key"


class VideoOutputs(BaseModel):
    video_url: str | None = None


class VideoError(BaseModel):
    message: str = "the clip could not be generated"


class VideoJob(BaseModel):
    id: str
    status: str
    outputs: VideoOutputs = VideoOutputs()
    error: VideoError = VideoError()


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _idempotency(key: str | None) -> dict[str, str]:
    return {} if key is None else {IDEMPOTENCY_HEADER: key}


def _typed[M: MediaValue](model: type[M], stored: MediaValue) -> M:
    return model.model_validate(stored.model_dump(mode="json", by_alias=True))


async def search_kb(
    ctx: ToolContext,
    query: Annotated[str, StringConstraints(max_length=600)],
    category: ProductCategory,
    locale: Locale,
    tenant: TenantId,
) -> SearchKbOut:
    response = await ctx.http.get(
        KB_SEARCH_URL,
        params={"query": query, "category": category, "locale": locale, "tenant": tenant},
        headers=_bearer(ctx.secret("kb_token")),
    )
    response.raise_for_status()
    return SearchKbOut.model_validate_json(response.content)


async def synthesize_voice(
    ctx: ToolContext,
    text: Annotated[str, StringConstraints(max_length=1500)],
    locale: Locale,
) -> SynthesizeVoiceOut:
    response = await ctx.http.post(
        SPEECH_URL,
        headers=_bearer(ctx.secret("openai_api_key")),
        json={
            "model": SPEECH_MODEL,
            "input": text,
            "voice": SPEECH_VOICE,
            "instructions": SPEECH_INSTRUCTIONS.format(locale=locale),
            "response_format": "wav",
        },
    )
    response.raise_for_status()
    stored = await ctx.blobs.put(response.content, "audio/wav", "voice.wav")
    return SynthesizeVoiceOut(voice=_typed(Audio, stored))


async def start_clip(
    ctx: ToolContext,
    image: Image,
    text: Annotated[str, StringConstraints(max_length=1500)],
    seconds: Annotated[int, Field(ge=4, le=8)],
) -> JobHandle:
    frame = base64.b64encode(await ctx.blobs.get(image)).decode("ascii")
    response = await ctx.http.post(
        VIDEOS_URL,
        headers=_bearer(ctx.secret(TOGETHER_API_KEY)),
        json={
            "model": CLIP_MODEL,
            "prompt": text,
            "seconds": str(seconds),
            "media": {"frame_images": [{"input_image": frame, "frame": "first"}]},
        },
    )
    response.raise_for_status()
    job = VideoJob.model_validate_json(response.content)
    return JobHandle(job_id=job.id, provider=CLIP_PROVIDER)


async def _clip_done(ctx: ToolContext, job: VideoJob) -> JobPoll[RenderClipOut]:
    url = job.outputs.video_url
    if url is None:
        return JobFailed(message="the job finished with no link to the clip")
    response = await ctx.http.get(url)
    response.raise_for_status()
    stored = await ctx.blobs.put(response.content, "video/mp4", "clip.mp4")
    return JobDone(value=RenderClipOut(clip=_typed(Video, stored)))


async def _clip_failed(ctx: ToolContext, job: VideoJob) -> JobPoll[RenderClipOut]:
    return JobFailed(message=job.error.message)


async def _clip_pending(ctx: ToolContext, job: VideoJob) -> JobPoll[RenderClipOut]:
    return JobPending()


JOB_STATES: Final[Mapping[str, Callable[[ToolContext, VideoJob], Awaitable[JobPoll[RenderClipOut]]]]] = {
    "completed": _clip_done,
    "failed": _clip_failed,
    "cancelled": _clip_failed,
}


async def poll_clip(ctx: ToolContext, job: JobHandle) -> JobPoll[RenderClipOut]:
    response = await ctx.http.get(f"{VIDEOS_URL}/{job.job_id}", headers=_bearer(ctx.secret(TOGETHER_API_KEY)))
    response.raise_for_status()
    video = VideoJob.model_validate_json(response.content)
    return await JOB_STATES.get(video.status, _clip_pending)(ctx, video)


async def lookup_order(ctx: ToolContext, order_id: OrderIdField) -> LookupOrderOut:
    response = await ctx.http.get(f"{ORDERS_URL}/{order_id}", headers=_bearer(ctx.secret(ORDERS_TOKEN)))
    response.raise_for_status()
    return LookupOrderOut.model_validate_json(response.content)


async def issue_store_credit(
    ctx: ToolContext,
    customer_id: CustomerIdField,
    order_id: OrderIdField,
    amount: Money,
) -> IssueStoreCreditOut:
    response = await ctx.http.post(
        f"{ORDERS_URL}/{order_id}/store-credits",
        headers=_bearer(ctx.secret(ORDERS_TOKEN)) | _idempotency(ctx.idempotency_key),
        json={"customer_id": customer_id, "amount": amount.model_dump(mode="json")},
    )
    response.raise_for_status()
    return IssueStoreCreditOut.model_validate_json(response.content)
