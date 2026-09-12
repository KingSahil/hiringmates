"""
Configuration.

Only settings something actually reads live here. A knob nothing reads implies
configurability that does not exist.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_ROOT / ".env"
if _ENV_FILE.exists():
    load_dotenv(_ENV_FILE)

# Path to the GitHub detector, resolved relative to the repo root.
# backend/  ->  ../tools/github-detector
_REPO_ROOT = _BACKEND_ROOT.parent
DETECTOR_CLI = str(_REPO_ROOT / "tools" / "github-detector" / "scripts" / "detect_cli.py")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass
class Settings:
    # --- LLM ---
    gemini_api_key: str = field(
        default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = field(
        default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-3.7-flash"))

    # --- Supabase (service role; bypasses RLS) ---
    supabase_url: str = field(
        default_factory=lambda: os.getenv("SUPABASE_URL", ""))
    supabase_service_role_key: str = field(
        default_factory=lambda: os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))

    # --- Cache ---
    # Gates RE-EXTRACTION only. Enhanced profiles persist beyond this.
    extraction_ttl_days: int = field(
        default_factory=lambda: _int("EXTRACTION_TTL_DAYS", 30))

    # --- Detector ---
    detector_cli: str = DETECTOR_CLI
    detector_timeout_seconds: float = 180.0

    def validate(self) -> list[str]:
        """Return a list of problems. Empty means usable."""
        problems: list[str] = []
        if not self.gemini_api_key:
            problems.append("GEMINI_API_KEY is not set")
        if not self.supabase_url or not self.supabase_service_role_key:
            problems.append(
                "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set "
                "(falling back to in-memory storage is only valid in tests)")
        return problems


def load_settings() -> Settings:
    return Settings()
