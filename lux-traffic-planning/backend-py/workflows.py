"""
TMP Workflow Logic, SLA State Machine, and Invoicing Service.

Provides pure-logic functions (no DB dependencies) for:
  - TMP creation with auto-assigned hours
  - Status validation and transition (state machine)
  - SLA deadline calculation
  - Planner tracking
  - Invoice amount calculation
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from models import (
    TMPType,
    TMPStatus,
    HOURS_ALLOCATION,
    SLA_WAIT_DAYS,
    STATUS_TRANSITIONS,
    InvoiceStatus,
)


# ── TMP Creation ───────────────────────────────────────────────────────────

def create_tmp_base(
    client_id: str,
    tmp_type: TMPType,
    planners: list[str] | None = None,
) -> dict[str, Any]:
    """
    Initialize a new TMP with the correct base hours.

    Args:
        client_id: UUID of the client.
        tmp_type: Type of TMP (basic=6h, detailed=6h, complex=10h, revision=0h).
        planners: Optional list of planner IDs to start with.

    Returns:
        Dictionary of TMP initialisation data.
    """
    base_hours = HOURS_ALLOCATION[tmp_type]

    return {
        "client_id": client_id,
        "type": tmp_type.value,
        "allocated_hours": base_hours,
        "hours_tracked": 0.0,
        "planners_involved": planners or [],
        "status": TMPStatus.DRAFT.value,
        "lga_fee": 0.0,
        "rtm_fee": 0.0,
        "sla_deadlines": {},
        "description": "",
        "location": "",
    }


# ── Auto-Assigned Hours ────────────────────────────────────────────────────

def get_allocated_hours(tmp_type: TMPType) -> int:
    """Return the default allocated hours for a given TMP type."""
    return HOURS_ALLOCATION[tmp_type]


# ── Status State Machine ───────────────────────────────────────────────────

def is_valid_transition(current: TMPStatus, next_status: TMPStatus) -> bool:
    """Check whether moving from ``current`` to ``next_status`` is allowed."""
    allowed = STATUS_TRANSITIONS.get(current, [])
    return next_status in allowed


def trigger_approval_workflow(
    tmp: dict[str, Any],
    approval_type: str,
) -> dict[str, Any]:
    """
    Advance a TMP into an approval workflow stage and set its SLA deadline.

    Args:
        tmp: The TMP dictionary (must have 'status' and 'sla_deadlines' keys).
        approval_type: One of 'LGA', 'MRWA_RPL', 'HVS', 'PTA', 'CLIENT_REVIEW'.

    Returns:
        Updated TMP dictionary with new status and sla_deadlines.

    Raises:
        ValueError: If the approval_type is unknown or the transition is invalid.
    """
    status_map: dict[str, TMPStatus] = {
        "LGA": TMPStatus.PENDING_LGA,
        "MRWA_RPL": TMPStatus.PENDING_MRWA_RPL,
        "HVS": TMPStatus.PENDING_HVS,
        "PTA": TMPStatus.PENDING_PTA,
        "CLIENT_REVIEW": TMPStatus.PENDING_CLIENT_REVIEW,
    }

    if approval_type not in status_map:
        raise ValueError(
            f"Unknown approval_type '{approval_type}'. "
            f"Expected one of: {', '.join(status_map)}"
        )

    next_status = status_map[approval_type]
    current = TMPStatus(tmp["status"])

    if not is_valid_transition(current, next_status):
        raise ValueError(
            f"Invalid transition: {current.value} -> {next_status.value}"
        )

    wait_days = SLA_WAIT_DAYS.get(approval_type, 10)
    deadline = datetime.now(timezone.utc) + timedelta(days=wait_days)

    tmp["status"] = next_status.value
    sla = dict(tmp.get("sla_deadlines") or {})
    sla[approval_type] = deadline.isoformat()
    tmp["sla_deadlines"] = sla

    return tmp


def advance_status(tmp: dict[str, Any], target: TMPStatus) -> dict[str, Any]:
    """
    Advance (or update) the TMP to an arbitrary valid status.

    This is the generic state-machine entry point. For SLA-triggered
    transitions use ``trigger_approval_workflow`` instead.

    Raises:
        ValueError: If the transition is not in the allowed graph.
    """
    current = TMPStatus(tmp["status"])
    if not is_valid_transition(current, target):
        raise ValueError(
            f"Invalid transition: {current.value} -> {target.value}"
        )
    tmp["status"] = target.value
    return tmp


# ── Planner Tracking ───────────────────────────────────────────────────────

def track_planner_interaction(
    tmp: dict[str, Any],
    planner_id: str,
) -> dict[str, Any]:
    """
    Record a planner interaction with the TMP.

    Adds the planner ID to ``planners_involved`` if not already present.
    Returns the updated TMP dictionary.
    """
    planners: list[str] = list(tmp.get("planners_involved") or [])

    if planner_id not in planners:
        planners.append(planner_id)

    tmp["planners_involved"] = planners
    return tmp


# ── Invoicing Service ──────────────────────────────────────────────────────

def calculate_invoice_totals(
    lga_fee: float = 0.0,
    rtm_fee: float = 0.0,
    hours_tracked: float = 0.0,
    hourly_rate: float = 150.0,
) -> dict[str, float]:
    """
    Calculate invoice line items and total.

    The total is: labour (hours_tracked × hourly_rate) + LGA fee + RTM fee.

    Returns:
        dict with 'labour_cost', 'lga_fee', 'rtm_fee', 'total_amount'.
    """
    labour_cost = hours_tracked * hourly_rate
    total = labour_cost + lga_fee + rtm_fee

    return {
        "labour_cost": round(labour_cost, 2),
        "lga_fee": round(lga_fee, 2),
        "rtm_fee": round(rtm_fee, 2),
        "total_amount": round(total, 2),
    }


def build_invoice_base(
    client: dict[str, Any],
    tmp: dict[str, Any],
    hourly_rate: float = 150.0,
) -> dict[str, Any]:
    """
    Build an invoice dictionary from client and TMP data.

    Auto-pulls client details, calculates totals from hours tracked,
    LGA fee, and RTM fee.

    Args:
        client: dict with at least 'id', 'name'.
        tmp: dict with 'id', 'tmp_number', 'lga_fee', 'rtm_fee',
             'hours_tracked'.

    Returns:
        Invoice initialisation data.
    """
    hours = float(tmp.get("hours_tracked") or 0.0)
    lga = float(tmp.get("lga_fee") or 0.0)
    rtm = float(tmp.get("rtm_fee") or 0.0)

    totals = calculate_invoice_totals(
        lga_fee=lga,
        rtm_fee=rtm,
        hours_tracked=hours,
        hourly_rate=hourly_rate,
    )

    return {
        "client_id": client["id"],
        "tmp_id": tmp["id"],
        "lga_fee": lga,
        "rtm_fee": rtm,
        "hours_tracked": hours,
        "hourly_rate": hourly_rate,
        "labour_cost": totals["labour_cost"],
        "total_amount": totals["total_amount"],
        "status": InvoiceStatus.DRAFT.value,
        "due_date": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    }
