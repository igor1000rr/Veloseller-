"""Recount-like event detection."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Snapshot:
    snapshot_id: str
    snapshot_time: datetime
    stock_quantity: int


def detect_recount_pairs(
    snapshots: list[Snapshot],
    same_day_window_hours: int = 12,
    min_magnitude_ratio: float = 0.5,
) -> list[tuple[Snapshot, Snapshot]]:
    if len(snapshots) < 3:
        return []
    snapshots = sorted(snapshots, key=lambda s: s.snapshot_time)
    pairs: list[tuple[Snapshot, Snapshot]] = []
    for i in range(1, len(snapshots) - 1):
        prev = snapshots[i - 1]
        cur = snapshots[i]
        delta_in = cur.stock_quantity - prev.stock_quantity
        if delta_in == 0:
            continue
        baseline = max(1, prev.stock_quantity)
        if abs(delta_in) < min_magnitude_ratio * baseline:
            continue
        for j in range(i + 1, len(snapshots)):
            nxt = snapshots[j]
            hours = (nxt.snapshot_time - cur.snapshot_time).total_seconds() / 3600
            if hours > same_day_window_hours:
                break
            delta_out = nxt.stock_quantity - cur.stock_quantity
            if delta_in * delta_out >= 0:
                continue
            if abs(abs(delta_in) - abs(delta_out)) / max(1, abs(delta_in)) <= 0.25:
                pairs.append((cur, nxt))
                break
    return pairs
