"""Request/response payloads for brief work-product (findings + overrides).

The blobs are opaque to the backend — findings carry the frontend-owned
Finding shape, overrides are {panelKey: {label: value}}. We validate only the
envelope, not the contents.
"""
from typing import Any

from pydantic import BaseModel


class FindingsPayload(BaseModel):
    findings: list[dict[str, Any]] = []


class OverridesPayload(BaseModel):
    overrides: dict[str, dict[str, str]] = {}
