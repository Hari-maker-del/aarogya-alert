"""Opt-in Supabase Auth + PostgreSQL integration probe for a dedicated staging project.

This script performs real writes. It intentionally refuses the configured production
Supabase project and requires an explicit staging confirmation secret. Audit events
are append-only, so every successful run leaves a small, synthetic test record behind.
"""

from __future__ import annotations

import os
import re
import sys
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

PRODUCTION_PROJECT_REF = "ipqgtcfnlaivnaeehywm"
CONFIRMATION_PHRASE = "I_HAVE_CONFIRMED_THIS_IS_STAGING"
PROJECT_REF_PATTERN = re.compile(r"^[a-z0-9]{20}$")


@dataclass(frozen=True)
class Config:
    url: str
    publishable_key: str
    reviewer_email: str
    reviewer_password: str
    expected_project_ref: str


def validate_target(url: str, expected_project_ref: str, confirmation: str) -> str:
    """Validate the destination before credentials are used or any request is sent."""
    normalized_url = url.rstrip("/")
    parsed = urlparse(normalized_url)
    expected = expected_project_ref.strip().lower()

    if expected == PRODUCTION_PROJECT_REF:
        raise ValueError("The production Supabase project is forbidden for this test.")
    if not PROJECT_REF_PATTERN.fullmatch(expected):
        raise ValueError("Expected project ref must be a 20-character Supabase project ref.")
    if parsed.scheme != "https" or parsed.hostname != f"{expected}.supabase.co":
        raise ValueError("Supabase URL host must exactly match the explicitly supplied staging project ref.")
    if parsed.port is not None or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Supabase URL must be a plain HTTPS project URL without credentials or extra components.")
    if confirmation != CONFIRMATION_PHRASE:
        raise ValueError("Missing explicit staging write confirmation secret.")
    return normalized_url


def load_config(env: dict[str, str] | None = None) -> Config:
    source = os.environ if env is None else env
    required = {
        "AAROGYA_STAGING_SUPABASE_URL": "Supabase staging URL",
        "AAROGYA_STAGING_PUBLISHABLE_KEY": "Supabase staging publishable key",
        "AAROGYA_STAGING_REVIEWER_EMAIL": "staging reviewer email",
        "AAROGYA_STAGING_REVIEWER_PASSWORD": "staging reviewer password",
        "AAROGYA_STAGING_EXPECTED_PROJECT_REF": "expected staging project ref",
        "AAROGYA_STAGING_CONFIRM_WRITES": "staging write confirmation",
    }
    missing = [label for name, label in required.items() if not source.get(name)]
    if missing:
        raise ValueError("Missing required staging configuration: " + ", ".join(missing) + ".")

    safe_url = validate_target(
        source["AAROGYA_STAGING_SUPABASE_URL"],
        source["AAROGYA_STAGING_EXPECTED_PROJECT_REF"],
        source["AAROGYA_STAGING_CONFIRM_WRITES"],
    )
    return Config(
        url=safe_url,
        publishable_key=source["AAROGYA_STAGING_PUBLISHABLE_KEY"],
        reviewer_email=source["AAROGYA_STAGING_REVIEWER_EMAIL"],
        reviewer_password=source["AAROGYA_STAGING_REVIEWER_PASSWORD"],
        expected_project_ref=source["AAROGYA_STAGING_EXPECTED_PROJECT_REF"],
    )


def _expect_success(response: httpx.Response, operation: str, expected: tuple[int, ...] = (200, 201, 204)) -> None:
    if response.status_code not in expected:
        # Never print response bodies or request headers: they may contain credentials or user data.
        raise RuntimeError(f"{operation} failed with HTTP {response.status_code}.")


def _json(response: httpx.Response, operation: str) -> Any:
    try:
        return response.json()
    except ValueError as exc:
        raise RuntimeError(f"{operation} returned an invalid JSON response.") from exc


def run(config: Config) -> None:
    base_headers = {"apikey": config.publishable_key, "Accept": "application/json"}
    with httpx.Client(timeout=15.0, follow_redirects=False) as client:
        # Authenticate against Supabase Auth using a dedicated staging-only reviewer.
        auth_response = client.post(
            f"{config.url}/auth/v1/token",
            params={"grant_type": "password"},
            headers={**base_headers, "Content-Type": "application/json"},
            json={"email": config.reviewer_email, "password": config.reviewer_password},
        )
        _expect_success(auth_response, "Staging reviewer sign-in")
        token_payload = _json(auth_response, "Staging reviewer sign-in")
        token = token_payload.get("access_token")
        if not token:
            raise RuntimeError("Supabase Auth did not return an access token.")

        auth_headers = {**base_headers, "Authorization": f"Bearer {token}"}
        user_response = client.get(f"{config.url}/auth/v1/user", headers=auth_headers)
        _expect_success(user_response, "Staging token verification")
        user = _json(user_response, "Staging token verification")
        user_id = user.get("id")
        if not user_id or user.get("email", "").lower() != config.reviewer_email.lower():
            raise RuntimeError("The verified Supabase identity did not match the staging reviewer account.")

        role_response = client.get(
            f"{config.url}/rest/v1/reviewer_roles",
            params={"select": "user_id,role", "user_id": f"eq.{user_id}", "limit": "1"},
            headers=auth_headers,
        )
        _expect_success(role_response, "Database-backed reviewer role check")
        role_rows = _json(role_response, "Database-backed reviewer role check")
        if not role_rows or role_rows[0].get("role") not in {"reviewer", "admin"}:
            raise RuntimeError("The staging test account must have a database-backed reviewer or admin role.")

        # Use a unique, synthetic ID; no live alert or person-level data is read or modified.
        probe_id = f"STG-IT-{uuid.uuid4().hex}"
        note = f"staging integration probe {uuid.uuid4().hex}"
        print(f"Target verified: {config.expected_project_ref}.supabase.co")
        print(f"Creating synthetic probe: {probe_id}")

        created_response = client.post(
            f"{config.url}/rest/v1/alert_investigations",
            headers={**auth_headers, "Content-Type": "application/json", "Prefer": "return=representation"},
            json={"alert_id": probe_id, "status": "new", "created_by": user_id},
        )
        _expect_success(created_response, "Create staging investigation")
        created_rows = _json(created_response, "Create staging investigation")
        if not created_rows or created_rows[0].get("alert_id") != probe_id:
            raise RuntimeError("The staging investigation insert could not be verified.")

        updated_response = client.patch(
            f"{config.url}/rest/v1/alert_investigations",
            params={"alert_id": f"eq.{probe_id}", "select": "alert_id,status,assigned_reviewer_id"},
            headers={**auth_headers, "Content-Type": "application/json", "Prefer": "return=representation"},
            json={
                "status": "investigating",
                "assigned_reviewer_id": user_id,
                "findings": note,
            },
        )
        _expect_success(updated_response, "Update staging investigation")
        updated_rows = _json(updated_response, "Update staging investigation")
        if not updated_rows or updated_rows[0].get("status") != "investigating":
            raise RuntimeError("The updated staging investigation could not be verified.")

        before_state = {"status": "new", "assigned_reviewer_id": None}
        after_state = {"status": "investigating", "assigned_reviewer_id": user_id}
        event_response = client.post(
            f"{config.url}/rest/v1/audit_events",
            headers={**auth_headers, "Content-Type": "application/json", "Prefer": "return=representation"},
            json={
                "alert_id": probe_id,
                "actor_id": user_id,
                "action": "status_updated",
                "before_json": before_state,
                "after_json": after_state,
                "note": note,
            },
        )
        _expect_success(event_response, "Append staging audit event")
        inserted_events = _json(event_response, "Append staging audit event")
        if not inserted_events:
            raise RuntimeError("The staging audit event insert returned no record.")

        # Read the records back in new HTTP requests, proving the stored representation is queryable.
        read_workflow_response = client.get(
            f"{config.url}/rest/v1/alert_investigations",
            params={"select": "alert_id,status,assigned_reviewer_id", "alert_id": f"eq.{probe_id}", "limit": "1"},
            headers=auth_headers,
        )
        _expect_success(read_workflow_response, "Read back staging investigation")
        workflow_rows = _json(read_workflow_response, "Read back staging investigation")
        if not workflow_rows or workflow_rows[0].get("status") != "investigating":
            raise RuntimeError("The saved investigation state was not readable after the update.")

        read_event_response = client.get(
            f"{config.url}/rest/v1/audit_events",
            params={
                "select": "alert_id,actor_id,action,before_json,after_json,note",
                "alert_id": f"eq.{probe_id}",
                "note": f"eq.{note}",
                "limit": "1",
            },
            headers=auth_headers,
        )
        _expect_success(read_event_response, "Read back staging audit event")
        event_rows = _json(read_event_response, "Read back staging audit event")
        if not event_rows:
            raise RuntimeError("The append-only audit event was not readable after insertion.")
        event = event_rows[0]
        if event.get("actor_id") != user_id or event.get("action") != "status_updated":
            raise RuntimeError("The persisted audit event attribution or action did not match.")
        if event.get("before_json") != before_state or event.get("after_json") != after_state:
            raise RuntimeError("The persisted audit event before/after values did not match.")

    print("PASS: Supabase password sign-in and token verification.")
    print("PASS: Database-backed reviewer authorization.")
    print("PASS: PostgreSQL investigation insert, update, and read-back.")
    print("PASS: Append-only audit event insert, attribution, and read-back.")
    print("Note: staging probe rows and append-only audit events are intentionally retained.")


def main() -> int:
    try:
        config = load_config()
        run(config)
    except (ValueError, RuntimeError, httpx.HTTPError) as exc:
        print(f"STAGING INTEGRATION TEST FAILED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
