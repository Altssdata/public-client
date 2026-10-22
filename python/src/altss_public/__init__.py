"""Named, anonymous public Altss GETs. No account credentials or Product access."""

from __future__ import annotations

import http.client
import json
import math
import re
import ssl
import time
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any
from urllib.parse import urlencode

__version__ = "0.1.0"
__all__ = ["AltssHttpError", "AltssPublicClient", "PublicResponse", "resources"]
_HOST = "altss.com"
_ORIGIN = "https://" + _HOST
_MAX_BYTES = 4 * 1024 * 1024
resources = MappingProxyType(
    {
        **{
            f"catalog:{n}": f"/api/v1/{n}-catalog.json"
            for n in ("data", "task", "commercial")
        },
        "openapi": "/api/v1/openapi.json",
        **{
            f"schema:{n}": f"/api/v1/schemas/{n}.json"
            for n in (
                "company",
                "organization",
                "family-office",
                "institutional-investor",
                "person",
                "fund",
                "transaction",
                "relationship",
                "commitment",
                "event",
                "evidence",
                "task-result",
            )
        },
        **{
            f"document:{n}": f"/{n}.md"
            for n in (
                "developers",
                "pricing",
                "methodology",
                "coverage",
                "platform",
                "ai",
                "agents",
                "auth",
            )
        },
    }
)


class AltssHttpError(Exception):
    """HTTP failure without retaining an untrusted response body."""

    def __init__(self, status: int, retry_after: str | None = None) -> None:
        super().__init__(f"Altss public resource returned HTTP {status}")
        self.status = status
        self.retry_after = retry_after


@dataclass(frozen=True)
class PublicResponse:
    status: int
    data: dict[str, Any] | str | None
    url: str
    etag: str | None
    last_modified: str | None
    cache_control: str | None
    environment: str | None = None
    rate_limit: dict[str, str | None] | None = None


def _invalid_json_constant(value: str) -> None:
    raise ValueError("Altss public resource returned invalid JSON")


class AltssPublicClient:
    """Synchronous fixed-origin reader. One GET, no redirects, credentials or retries."""

    def __init__(self, *, timeout: float = 10.0, sandbox: bool = False) -> None:
        if (
            isinstance(timeout, bool)
            or not isinstance(timeout, (int, float))
            or not math.isfinite(timeout)
            or not 0 < timeout <= 60
        ):
            raise ValueError(
                "timeout must be a finite number greater than 0 and at most 60 seconds"
            )
        if not isinstance(sandbox, bool):
            raise TypeError("sandbox must be a boolean")
        self._timeout = float(timeout)
        self._prefix = "/api/v1/sandbox" if sandbox else "/api/v1"

    def get_catalog(self, name: str, *, etag: str | None = None) -> PublicResponse:
        return self.read(f"catalog:{name}", etag=etag)

    def get_schema(self, name: str, *, etag: str | None = None) -> PublicResponse:
        return self.read(f"schema:{name}", etag=etag)

    def get_document(self, name: str, *, etag: str | None = None) -> PublicResponse:
        return self.read(f"document:{name}", etag=etag)

    def read(self, resource: str, *, etag: str | None = None) -> PublicResponse:
        if not isinstance(resource, str) or resource not in resources:
            raise ValueError("Unknown Altss public resource")
        if etag is not None and (
            not isinstance(etag, str)
            or not re.fullmatch(r'(?:W/)?"[\x21\x23-\x7e]{1,200}"', etag)
        ):
            raise ValueError("etag must be an HTTP entity tag")
        return self._get(
            resources[resource], markdown=resource.startswith("document:"), etag=etag
        )

    def search_profiles(
        self, query: str, *, limit: int = 5, cursor: str | None = None
    ) -> PublicResponse:
        if (
            not isinstance(query, str)
            or not 2 <= len(query.strip()) <= 120
            or not any(c.isalnum() for c in query)
        ):
            raise ValueError("Use a 2-120 character organization name")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 5:
            raise ValueError("limit must be an integer from 1 to 5")
        if cursor is not None and (
            not isinstance(cursor, str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", cursor)
        ):
            raise ValueError("Invalid cursor")
        params = {"query": query.strip(), "limit": str(limit)}
        if cursor is not None:
            params["cursor"] = cursor
        return self._get(f"{self._prefix}/public/profiles?{urlencode(params)}")

    def get_profile(self, slug: str) -> PublicResponse:
        if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9-]{1,200}", slug):
            raise ValueError("Invalid public profile slug")
        return self._get(f"{self._prefix}/public/profiles/{slug}")

    def _get(
        self, path: str, *, markdown: bool = False, etag: str | None = None
    ) -> PublicResponse:
        deadline = time.monotonic() + self._timeout

        def remaining() -> float:
            value = deadline - time.monotonic()
            if value <= 0:
                raise TimeoutError("Altss public read deadline exceeded")
            return value

        connection = http.client.HTTPSConnection(
            _HOST, timeout=remaining(), context=ssl.create_default_context()
        )
        response = None
        try:
            connection.connect()
            transport_socket = connection.sock
            if transport_socket is None:
                raise ConnectionError("Altss public HTTPS connection did not open")
            headers = {
                "Accept": "text/markdown" if markdown else "application/json",
                "Accept-Encoding": "identity",
                "User-Agent": f"AltssPythonPublicClient/{__version__}",
            }
            if etag is not None:
                headers["If-None-Match"] = etag
            transport_socket.settimeout(remaining())
            connection.request("GET", path, headers=headers)
            transport_socket.settimeout(remaining())
            response = connection.getresponse()
            metadata: dict[str, Any] = {
                "url": _ORIGIN + path,
                "etag": response.getheader("ETag"),
                "last_modified": response.getheader("Last-Modified"),
                "cache_control": response.getheader("Cache-Control"),
            }
            environment = response.getheader("Altss-Environment")
            if environment in ("production", "sandbox"):
                metadata["environment"] = environment
            if response.getheader("RateLimit-Limit") is not None:
                metadata["rate_limit"] = {
                    k: response.getheader(h)
                    for k, h in (
                        ("limit", "RateLimit-Limit"),
                        ("remaining", "RateLimit-Remaining"),
                        ("reset_seconds", "RateLimit-Reset"),
                    )
                }
            if response.status == 304 and etag is not None:
                return PublicResponse(status=304, data=None, **metadata)
            if response.status != 200:
                raise AltssHttpError(response.status, response.getheader("Retry-After"))
            media = (
                (response.getheader("Content-Type") or "").split(";")[0].strip().lower()
            )
            allowed = (
                ("text/markdown",)
                if markdown
                else ("application/json", "application/schema+json")
            )
            if media not in allowed:
                raise ValueError(
                    "Altss public resource returned an unexpected content type"
                )
            if (
                response.getheader("Content-Encoding") or "identity"
            ).lower() != "identity":
                raise ValueError(
                    "Altss public resource returned an unsupported content encoding"
                )
            length = response.getheader("Content-Length")
            if length is not None and (
                not length.isascii() or not length.isdigit() or int(length) > _MAX_BYTES
            ):
                raise ValueError(
                    "Altss public resource has an invalid or oversized Content-Length"
                )
            chunks: list[bytes] = []
            size = 0
            while True:
                transport_socket.settimeout(remaining())
                chunk = response.read1(min(65536, _MAX_BYTES + 1 - size))
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_BYTES:
                    raise ValueError("Altss public resource exceeds the 4 MiB limit")
                chunks.append(chunk)
                # HTTPResponse can close a Connection: close socket at the exact
                # Content-Length boundary. No further socket operation is needed.
                if length is not None and size == int(length):
                    break
            remaining()
            body = b"".join(chunks).decode("utf-8", errors="strict")
            if length is not None and int(length) != size:
                raise ValueError("Altss public resource body is incomplete")
            data = (
                body
                if markdown
                else json.loads(body, parse_constant=_invalid_json_constant)
            )
            if not markdown and not isinstance(data, dict):
                raise ValueError("Altss public JSON resource must be an object")
            return PublicResponse(status=200, data=data, **metadata)
        except TimeoutError as error:
            raise TimeoutError("Altss public read deadline exceeded") from error
        finally:
            if response is not None:
                response.close()
            connection.close()
