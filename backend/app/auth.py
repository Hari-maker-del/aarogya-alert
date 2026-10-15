"""Validate reviewer sessions through Supabase Auth.

The browser's actor_id fields are never trusted. This dependency resolves the
Bearer access token with Supabase and derives the actor UUID from the response.
"""
from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


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
            detail="Sign in with a reviewer account to change investigation records.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
