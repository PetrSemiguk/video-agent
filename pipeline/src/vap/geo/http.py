"""The one HTTP client of vap.geo: an honest User-Agent on every request.

Cloudflare in front of OpenHistoricalMap rejects the default python-httpx signature,
so no code here may build a bare httpx client or call httpx.get/stream directly.
"""

from __future__ import annotations

import httpx

USER_AGENT = "video-agent/0.1 (+https://github.com/PetrSemiguk/video-agent)"
DEFAULT_TIMEOUT = httpx.Timeout(60.0, connect=15.0)


def client(timeout: httpx.Timeout | float = DEFAULT_TIMEOUT, **kwargs) -> httpx.Client:
    headers = {"User-Agent": USER_AGENT, **kwargs.pop("headers", {})}
    return httpx.Client(timeout=timeout, follow_redirects=True, headers=headers, **kwargs)
