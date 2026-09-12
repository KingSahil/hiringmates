"""
LLM layer tests. No network, no API keys.

Config-sensitive cases blank their keys explicitly: `Settings` reads from
backend/.env, so anything relying on "unset" must not inherit the developer's
real environment.
"""

from __future__ import annotations

import pytest

from rag.config import Settings
from rag.llm import (
    PROVIDERS,
    FakeLLM,
    LLMError,
    _parse_json,
    build_llm,
)
from rag.models import RoughProfile


class TestJsonParsing:
    def test_plain_json(self):
        assert _parse_json('{"a": 1}', "test") == {"a": 1}

    def test_fenced_block_is_stripped(self):
        """Some models wrap output despite being told not to."""
        assert _parse_json('```json\n{"a": 1}\n```', "test") == {"a": 1}

    def test_bare_fence_is_stripped(self):
        assert _parse_json('```\n{"a": 1}\n```', "test") == {"a": 1}

    def test_non_json_raises_with_context(self):
        with pytest.raises(LLMError) as e:
            _parse_json("I think the answer is...", "test")
        assert "non-JSON" in str(e.value)


class TestCompleteModel:
    def test_valid_payload_is_validated(self):
        llm = FakeLLM(default={
            "summary": "s", "headline": "h", "strengths": [],
            "gaps": [], "evidence": []})
        profile = llm.complete_model("sys", "user", RoughProfile)
        assert profile.headline == "h"

    def test_mismatched_payload_raises_llmerror_not_validationerror(self):
        llm = FakeLLM(default={"unexpected": "shape"})
        with pytest.raises(LLMError) as e:
            llm.complete_model("sys", "user", RoughProfile)
        assert "does not match RoughProfile" in str(e.value)


class TestProviderSelection:
    def test_providers_exposed(self):
        assert set(PROVIDERS) == {"gemini", "openai", "anthropic"}

    def test_unknown_provider_is_rejected_with_the_valid_set(self):
        with pytest.raises(LLMError) as e:
            build_llm(Settings(llm_provider="llama"))
        assert "gemini" in str(e.value)

    @pytest.mark.parametrize("provider", PROVIDERS)
    def test_missing_sdk_or_key_raises_llmerror(self, provider):
        """
        Either the SDK is absent or the key is empty; both must surface as a
        clear LLMError rather than an import crash or a silent misconfiguration.
        """
        with pytest.raises(LLMError):
            build_llm(Settings(llm_provider=provider))


class TestConfigValidation:
    """
    Keys are blanked explicitly in every case.

    `Settings` reads from backend/.env, so these assertions would otherwise
    depend on whether the developer has a real .env present. That made the
    suite pass locally and fail the moment a .env was written — see the
    note in the module docstring.
    """

    def test_gemini_active_only_requires_gemini_key(self):
        problems = Settings(llm_provider="gemini", gemini_api_key="").validate()
        assert any("GEMINI_API_KEY" in p for p in problems)
        assert not any("OPENAI" in p for p in problems)
        assert not any("ANTHROPIC" in p for p in problems)

    def test_openai_active_only_requires_openai_key(self):
        problems = Settings(llm_provider="openai", openai_api_key="").validate()
        assert any("OPENAI_API_KEY" in p for p in problems)
        assert not any("GEMINI" in p for p in problems)

    def test_anthropic_active_only_requires_anthropic_key(self):
        problems = Settings(llm_provider="anthropic",
                            anthropic_api_key="").validate()
        assert any("ANTHROPIC_API_KEY" in p for p in problems)
        assert not any("GEMINI" in p for p in problems)

    def test_unknown_provider_is_reported(self):
        problems = Settings(llm_provider="nope").validate()
        assert any("not one of" in p for p in problems)

    def test_configured_provider_reports_no_key_problem(self):
        """A populated key for the active provider silences that complaint."""
        problems = Settings(llm_provider="openai",
                            openai_api_key="sk-test").validate()
        assert not any("OPENAI_API_KEY" in p for p in problems)
