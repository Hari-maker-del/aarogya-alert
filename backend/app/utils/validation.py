"""Small validation helpers shared by route handlers."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status

from app.models import INDICATORS, INVESTIGATION_STATUSES, REVIEW_PRIORITIES


def require_known_indicator(indicator_type: str | None) -> None:
    if indicator_type and indicator_type not in INDICATORS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"indicator_type must be one of: {', '.join(INDICATORS)}",
        )


def require_known_priority(review_priority: str | None) -> None:
    if review_priority and review_priority not in REVIEW_PRIORITIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"review_priority must be one of: {', '.join(REVIEW_PRIORITIES)}",
        )


def require_known_investigation_status(investigation_status: str | None) -> None:
    if investigation_status and investigation_status not in INVESTIGATION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"investigation_status must be one of: {', '.join(INVESTIGATION_STATUSES)}",
        )


def require_valid_date_range(start_date: date | None, end_date: date | None) -> None:
    if start_date and end_date and end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date must be on or after start_date",
        )
