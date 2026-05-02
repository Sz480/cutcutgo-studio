from __future__ import annotations
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from fastapi import APIRouter, HTTPException
from studio.backend.models import MediaPreset

from cutcutgo.Cutcutgo import MEDIA  # type: ignore[import]

router = APIRouter()


def _to_preset(media_id: int, entry: dict) -> MediaPreset:
    return MediaPreset(
        id=media_id,
        name=entry.get("name", f"Media {media_id}"),
        default_pressure=float(entry.get("pressure", 8.5)),
        default_clearance=float(entry.get("clearance", 2.0)),
    )


@router.get("/", response_model=list[MediaPreset])
def list_media() -> list[MediaPreset]:
    return [_to_preset(mid, entry) for mid, entry in sorted(MEDIA.items())]


@router.get("/{media_id}", response_model=MediaPreset)
def get_media(media_id: int) -> MediaPreset:
    if media_id not in MEDIA:
        raise HTTPException(status_code=404, detail=f"Media ID {media_id} not found")
    return _to_preset(media_id, MEDIA[media_id])
