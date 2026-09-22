import secrets
import time
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Final

from aqven.spec import Audio, Image, Video
from lumen.types import (
    ApprovalDecision,
    CascadeTier,
    CaseIntent,
    CaseOutcome,
    CaseRecord,
    CaseStatus,
    MediaApproval,
    ReplyApproval,
    ReplyDraft,
    ReplyMedia,
    Resolution,
)

type ReplyDecision = Callable[[ReplyDraft, ReplyApproval], ReplyDraft | None]

ULID_RANDOM_BITS: Final = 80
CROCKFORD_ALPHABET: Final = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

STATUS_BY_DECISION: Final[Mapping[ApprovalDecision, CaseStatus]] = {
    "approve": "sent",
    "edit": "sent",
    "reject": "rejected",
}

REPLY_BY_DECISION: Final[Mapping[ApprovalDecision, ReplyDecision]] = {
    "approve": lambda reply, lead: reply,
    "edit": lambda reply, lead: ReplyDraft(text=lead.edited_text or reply.text, citations=[]),
    "reject": lambda reply, lead: None,
}


def finalize(
    intent: CaseIntent,
    tier: CascadeTier,
    record: CaseRecord,
    resolution: Resolution,
    reply: ReplyDraft,
    lead: ReplyApproval,
    media: MediaApproval,
    image: Image,
    voice: Audio,
    clip: Video,
) -> CaseOutcome:
    return CaseOutcome(
        case_ref=f"CASE-{_ulid()}",
        status=STATUS_BY_DECISION[lead.decision],
        intent=intent,
        tier=tier,
        record=record,
        resolution=resolution,
        reply=REPLY_BY_DECISION[lead.decision](reply, lead),
        media=ReplyMedia(
            image=image if media.use_image else None,
            voice=voice if media.use_voice else None,
            clip=clip if media.use_clip else None,
        ),
        closed_at=datetime.now(UTC),
    )


def _ulid() -> str:
    value = ((time.time_ns() // 1_000_000) << ULID_RANDOM_BITS) | secrets.randbits(ULID_RANDOM_BITS)
    return "".join(CROCKFORD_ALPHABET[(value >> shift) & 0b11111] for shift in range(125, -1, -5))
