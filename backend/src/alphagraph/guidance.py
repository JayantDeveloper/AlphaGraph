"""In-memory researcher guidance store.

Nodes read from this store at key decision points (revise_factor,
generate_candidates) so that mid-run guidance injected via the API is
picked up without requiring LangGraph state changes.

Thread-safety: CPython dict/list operations under the GIL are safe for
the single-append / full-copy access pattern used here.
"""
from __future__ import annotations

_STORE: dict[str, list[str]] = {}


def add(run_id: str, text: str) -> None:
    """Append a guidance note for the given run."""
    _STORE.setdefault(run_id, []).append(text.strip())


def get(run_id: str) -> list[str]:
    """Return all guidance notes for the given run (oldest-first)."""
    return list(_STORE.get(run_id, []))
