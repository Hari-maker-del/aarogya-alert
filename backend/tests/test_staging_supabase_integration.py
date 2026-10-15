"""Safety checks for the opt-in staging integration probe."""

from __future__ import annotations

import pytest

from scripts.staging_supabase_integration import (
    CONFIRMATION_PHRASE,
    PRODUCTION_PROJECT_REF,
    validate_target,
)


def test_staging_target_requires_exact_https_project_host():
    url = "https://abcdefghijklmnopqrst.supabase.co"
    assert validate_target(url, "abcdefghijklmnopqrst", CONFIRMATION_PHRASE) == url


@pytest.mark.parametrize(
    "url,expected",
    [
        (f"https://{PRODUCTION_PROJECT_REF}.supabase.co", PRODUCTION_PROJECT_REF),
        ("http://abcdefghijklmnopqrst.supabase.co", "abcdefghijklmnopqrst"),
        ("https://abcdefghijklmnopqrst.supabase.co.attacker.example", "abcdefghijklmnopqrst"),
        ("https://user@abcdefghijklmnopqrst.supabase.co", "abcdefghijklmnopqrst"),
    ],
)
def test_staging_target_rejects_unsafe_destinations(url, expected):
    with pytest.raises(ValueError):
        validate_target(url, expected, CONFIRMATION_PHRASE)


def test_staging_target_requires_deliberate_confirmation():
    with pytest.raises(ValueError, match="confirmation"):
        validate_target(
            "https://abcdefghijklmnopqrst.supabase.co",
            "abcdefghijklmnopqrst",
            "yes",
        )


def test_staging_target_requires_valid_project_ref():
    with pytest.raises(ValueError, match="20-character"):
        validate_target(
            "https://not-a-project.supabase.co",
            "not-a-project",
            CONFIRMATION_PHRASE,
        )
