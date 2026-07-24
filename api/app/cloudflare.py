"""Cloudflare Stream client. Enough for the PoC: pull a video from a URL and wait for it."""

import time

import httpx

from .config import settings

CF_BASE = "https://api.cloudflare.com/client/v4"


class CloudflareError(RuntimeError):
    pass


def _headers() -> dict[str, str]:
    if not settings.cf_account_id or not settings.cf_stream_token:
        raise CloudflareError("CF_ACCOUNT_ID and CF_STREAM_TOKEN must be set")
    return {"Authorization": f"Bearer {settings.cf_stream_token}"}


def copy_from_url(video_url: str, name: str, timeout_s: float = 300) -> tuple[str, int]:
    """Ask Cloudflare Stream to ingest a video from a public URL.

    Returns (stream_uid, duration_s). Blocks until the video is ready to stream.
    """
    headers = _headers()
    account = settings.cf_account_id
    with httpx.Client(timeout=60) as client:
        started = client.post(
            f"{CF_BASE}/accounts/{account}/stream/copy",
            headers=headers,
            json={"url": video_url, "meta": {"name": name}},
        ).json()
        if not started.get("success"):
            raise CloudflareError(f"copy failed: {started.get('errors')}")
        uid = started["result"]["uid"]

        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            result = client.get(
                f"{CF_BASE}/accounts/{account}/stream/{uid}", headers=headers
            ).json().get("result", {})
            state = (result.get("status") or {}).get("state")
            if result.get("readyToStream"):
                duration = result.get("duration") or 0
                return uid, int(duration) if duration and duration > 0 else 0
            if state == "error":
                raise CloudflareError(f"Cloudflare processing error: {result.get('status')}")
            time.sleep(5)

    raise CloudflareError("timed out waiting for Cloudflare to process the video")
