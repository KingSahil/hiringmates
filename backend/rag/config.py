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


_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if raw in _TRUE:
        return True
    if raw in _FALSE:
        return False
    return default


@dataclass
class Settings:
    # --- LLM ---
    # Which provider to use: gemini | openai | anthropic.
    llm_provider: str = field(
        default_factory=lambda: os.getenv("LLM_PROVIDER", "gemini").strip().lower())

    # Gemini (default)
    gemini_api_key: str = field(
        default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = field(
        default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-3.7-flash"))

    # OpenAI-compatible. Leave base_url unset for api.openai.com; set it for
    # OpenRouter, Groq, Together, vLLM, Ollama, LM Studio, etc.
    openai_api_key: str = field(
        default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    openai_model: str = field(
        default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    openai_base_url: str = field(
        default_factory=lambda: os.getenv("OPENAI_BASE_URL", ""))
    openai_json_mode: bool = field(
        default_factory=lambda: _bool("OPENAI_JSON_MODE", True))

    # Anthropic-compatible. Leave base_url unset for api.anthropic.com.
    anthropic_api_key: str = field(
        default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    anthropic_model: str = field(
        default_factory=lambda: os.getenv("ANTHROPIC_MODEL",
                                          "claude-sonnet-4-5"))
    anthropic_base_url: str = field(
        default_factory=lambda: os.getenv("ANTHROPIC_BASE_URL", ""))
    anthropic_max_tokens: int = field(
        default_factory=lambda: _int("ANTHROPIC_MAX_TOKENS", 4096))

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
    # Interpreter used to run the detector CLI. Blank means "the same
    # interpreter as this process". The detector needs `requests` and
    # `python-dotenv`; if they are not installed alongside the backend, point
    # this at an interpreter that has them (e.g. the detector's own venv).
    detector_python: str = field(
        default_factory=lambda: os.getenv("DETECTOR_PYTHON", ""))

    def validate(self) -> list[str]:
        """
        Return a list of problems. Empty means usable.

        Only the ACTIVE provider's credentials are required — configuring one
        provider must not demand keys for the others.
        """
        problems: list[str] = []

        provider = self.llm_provider
        if provider == "gemini" and not self.gemini_api_key:
            problems.append("LLM_PROVIDER=gemini but GEMINI_API_KEY is not set")
        elif provider == "openai" and not self.openai_api_key:
            problems.append("LLM_PROVIDER=openai but OPENAI_API_KEY is not set")
        elif provider == "anthropic" and not self.anthropic_api_key:
            problems.append(
                "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set")
        elif provider not in ("gemini", "openai", "anthropic"):
            problems.append(
                f"LLM_PROVIDER={provider!r} is not one of "
                "gemini | openai | anthropic")

        if not self.supabase_url or not self.supabase_service_role_key:
            problems.append(
                "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set "
                "(falling back to in-memory storage is only valid in tests)")
        return problems


def load_settings() -> Settings:
    return Settings()
