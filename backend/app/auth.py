"""Supabase session validation and reviewer role guards."""
from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)
_ACTIVE_ROLES = {"reviewer", "admin"}


def _configuration() -> tuple[str, str]:
    url = os.getenv("AAROGYA_SUPABASE_URL", "").rstrip("/")
    key = os.getenv("AAROGYA_SUPABASE_PUBLISHABLE_KEY", "")
    if not url or not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Reviewer authentication is not configured on the API.",
        )
    return url, key


def optional_authenticated_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any] | None:
    if credentials is None:
        return None
    url, key = _configuration()
    try:
        response = httpx.get(
            f"{url}/auth/v1/user",
            headers={"apikey": key, "Authorization": f"Bearer {credentials.credentials}"},
            timeout=8.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Reviewer authentication is temporarily unavailable.") from exc
    if response.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Reviewer session is invalid or expired.")
    if not response.is_success:
        raise HTTPException(status_code=502, detail="Could not validate reviewer session.")
    user = response.json()
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Reviewer session did not include a user identity.")
    return {"id": user_id, "email": user.get("email"), "access_token": credentials.credentials}


def require_authenticated_user(
    user: dict[str, Any] | None = Depends(optional_authenticated_user),
) -> dict[str, Any]:
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Sign in with a reviewer account to access this workflow.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_reviewer_role(user: dict[str, Any]) -> str:
    """Read the role stored in PostgreSQL; never trust client or user-editable metadata."""
    url, key = _configuration()
    try:
        response = httpx.get(
            f"{url}/rest/v1/reviewer_roles",
            params={"select": "role", "user_id": f"eq.{user['id']}", "limit": "1"},
            headers={"apikey": key, "Authorization": f"Bearer {user['access_token']}"},
            timeout=8.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="Reviewer permissions are temporarily unavailable.") from exc
    if not response.is_success:
        raise HTTPException(status_code=503, detail="Reviewer permissions could not be checked.")
    rows = response.json()
    role = rows[0].get("role") if rows else "pending"
    return role if role in {"pending", "reviewer", "admin"} else "pending"


def require_active_reviewer(
    user: dict[str, Any] = Depends(require_authenticated_user),
) -> dict[str, Any]:
    role = get_reviewer_role(user)
    user["role"] = role
    if role not in _ACTIVE_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Your reviewer account is awaiting administrator approval. You can sign in, but investigation changes remain disabled.",
        )
    return user


def require_admin(
    user: dict[str, Any] = Depends(require_active_reviewer),
) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Administrator access is required for reviewer approvals.")
    return user
