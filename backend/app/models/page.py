"""Pagination envelope (Plan 4 C2, R6). All list endpoints return
Page[T]: {items, total, next_offset}, next_offset None on the last page."""
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    next_offset: int | None = None


def page_of(items: list, total: int, offset: int) -> dict:
    """Build the envelope. next_offset points at the row after this page,
    or None when the page reaches the end."""
    consumed = offset + len(items)
    return {
        "items": items,
        "total": total,
        "next_offset": consumed if consumed < total else None,
    }
