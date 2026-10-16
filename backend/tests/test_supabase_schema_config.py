"""Tests for safe schema selection in Supabase PostgREST calls."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services import supabase_workflow


def test_supabase_rest_uses_configured_schema_profiles(monkeypatch):
    captured = {}

    class Response:
        is_success = True
        content = b"[]"

        @staticmethod
        def json():
            return []

    def fake_request(method, url, **kwargs):
        captured.update(kwargs)
        captured["url"] = url
        return Response()

    monkeypatch.setenv("AAROGYA_SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("AAROGYA_SUPABASE_PUBLISHABLE_KEY", "test-key")
    monkeypatch.setenv("AAROGYA_SUPABASE_SCHEMA", "aarogya_staging")
    monkeypatch.setattr(supabase_workflow.httpx, "request", fake_request)

    assert supabase_workflow._rest("GET", "reviewer_roles", "user-token") == []
    assert captured["headers"]["Accept-Profile"] == "aarogya_staging"
    assert captured["headers"]["Content-Profile"] == "aarogya_staging"
    assert captured["url"] == "https://example.supabase.co/rest/v1/reviewer_roles"


@pytest.mark.parametrize("schema", ["", "public;drop schema public", "1invalid", "a schema"])
def test_supabase_schema_rejects_invalid_identifier(monkeypatch, schema):
    monkeypatch.setenv("AAROGYA_SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("AAROGYA_SUPABASE_PUBLISHABLE_KEY", "test-key")
    monkeypatch.setenv("AAROGYA_SUPABASE_SCHEMA", schema)

    with pytest.raises(HTTPException) as error:
        supabase_workflow._config()
    assert error.value.status_code == 503


def test_supabase_schema_defaults_to_public(monkeypatch):
    monkeypatch.setenv("AAROGYA_SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("AAROGYA_SUPABASE_PUBLISHABLE_KEY", "test-key")
    monkeypatch.delenv("AAROGYA_SUPABASE_SCHEMA", raising=False)

    assert supabase_workflow._config() == (
        "https://example.supabase.co",
        "test-key",
        "public",
    )
