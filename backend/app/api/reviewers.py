"""Reviewer profile and administrator approval endpoints."""
from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_reviewer_role, require_active_reviewer, require_admin, require_authenticated_user
from app.services.supabase_workflow import list_reviewer_roles, set_reviewer_role

router = APIRouter(prefix="/api/reviewers", tags=["Reviewers"])


class ReviewerRoleUpdate(BaseModel):
    role: Literal["pending", "reviewer"]


@router.get("/me")
def reviewer_me(user: dict[str, Any] = Depends(require_authenticated_user)) -> dict[str, Any]:
    role = get_reviewer_role(user)
    return {
        "user_id": user["id"],
        "email": user.get("email"),
        "role": role,
        "can_review": role in {"reviewer", "admin"},
        "is_admin": role == "admin",
    }


@router.get("")
def reviewers(user: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    return {"items": list_reviewer_roles(user["access_token"])}


@router.patch("/{target_user_id}/role")
def reviewer_role_update(
    target_user_id: UUID,
    payload: ReviewerRoleUpdate,
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    if str(target_user_id) == user["id"]:
        raise HTTPException(status_code=422, detail="Admins cannot change their own role.")
    record = set_reviewer_role(user["access_token"], str(target_user_id), payload.role)
    return {"reviewer": record}
