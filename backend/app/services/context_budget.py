"""Token budget derivation.

The window is asked of the provider rather than hardcoded, and is the MINIMUM
of the primary and fallback models: stream_with_fallback can switch models
mid-request, so a context packed for the larger window would overflow the
smaller one after the packing decision was already made.
"""
import logging
from functools import lru_cache

from app.config import settings

logger = logging.getLogger(__name__)

CHARS_PER_TOKEN = 4.0  # measured 4.88 on real filing prose; 4.0 over-estimates
SAFETY_MARGIN_FRACTION = 0.05


def chars_to_tokens(n: int) -> int:
    return int(n / CHARS_PER_TOKEN)


def _fetch_input_limit(model_name: str) -> int:
    import google.generativeai as genai
    info = genai.get_model(f"models/{model_name}")
    return int(info.input_token_limit)


@lru_cache(maxsize=1)
def resolve_window() -> int:
    """Smaller of the two models' input windows. Cached for process lifetime."""
    try:
        limits = [
            _fetch_input_limit(settings.gemini_model),
            _fetch_input_limit(settings.gemini_fallback_model),
        ]
        return min(limits)
    except Exception as exc:
        logger.warning(
            "Model metadata unavailable (%s) — falling back to "
            "context_window_tokens=%d", exc, settings.context_window_tokens,
        )
        return settings.context_window_tokens


def budget_tokens(prompt_overhead_chars: int) -> int:
    """Tokens available for document context on this call."""
    window = resolve_window()
    margin = int(window * SAFETY_MARGIN_FRACTION)
    return window - chars_to_tokens(prompt_overhead_chars) - settings.max_tokens - margin


def resolved_strategy() -> str:
    """One place that decides the effective strategy.

    Explicit CONTEXT_STRATEGY wins; otherwise derive from the deprecated
    full_context_mode shim so existing deployments and flag tests keep working.
    Tasks 4 and 6 both call this rather than re-deriving the condition.
    """
    explicit = (settings.context_strategy or "").strip().lower()
    if explicit in {"auto", "full_text", "retrieval"}:
        return explicit
    return "full_text" if settings.full_context_mode else "retrieval"
