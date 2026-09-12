"""
LLM access.

Everything goes through `complete_model`, which asks for JSON and validates it
into a pydantic model. Two implementations ship:

* `GeminiLLM`  - real Google GenAI calls (needs GEMINI_API_KEY).
* `FakeLLM`    - canned responses keyed by stage, for tests. No network.

The backend never calls the SDK directly, so a missing key degrades to a clear
error rather than an import crash.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger("rag.llm")

T = TypeVar("T", bound=BaseModel)


class LLMError(RuntimeError):
    """Raised when a completion fails or returns unusable JSON."""


class LLMClient(ABC):
    @abstractmethod
    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        """Return a parsed JSON object. Raise LLMError on failure."""

    def complete_model(self, system: str, user: str, model: type[T]) -> T:
        """Complete and validate into *model*. Never raises ValidationError."""
        raw = self.complete_json(system, user)
        try:
            return model.model_validate(raw)
        except ValidationError as e:
            raise LLMError(
                f"model returned JSON that does not match {model.__name__}: {e}"
            ) from e


class GeminiLLM(LLMClient):
    """
    Google GenAI backend.

    NOTE: verified only for import-safety and call shape. Live behaviour is
    unverified in this environment (no API key available).
    """

    def __init__(self, api_key: str, model: str = "gemini-3.7-flash",
                 timeout_seconds: float = 60.0) -> None:
        if not api_key:
            raise LLMError("GEMINI_API_KEY is empty")
        self._model = model
        self._timeout = timeout_seconds
        try:
            from google import genai
        except ImportError as e:  # pragma: no cover
            raise LLMError(
                "google-genai is not installed; run `pip install google-genai`"
            ) from e
        self._client = genai.Client(api_key=api_key)

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        from google.genai import types

        try:
            response = self._client.models.generate_content(
                model=self._model,
                contents=user,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )
        except Exception as e:
            raise LLMError(f"Gemini call failed: {type(e).__name__}: {e}") from e

        text = getattr(response, "text", None)
        if not text:
            raise LLMError("Gemini returned no text")
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise LLMError(f"Gemini returned non-JSON output: {e}") from e


class FakeLLM(LLMClient):
    """
    Deterministic stand-in.

    `responses` maps a substring to a payload; the first matching key wins. If
    nothing matches, `default` is used. Lets tests drive every stage without a
    key and without flakiness.
    """

    def __init__(self, responses: dict[str, dict[str, Any]] | None = None,
                 default: dict[str, Any] | None = None) -> None:
        self.responses = responses or {}
        self.default = default or {}
        self.calls: list[tuple[str, str]] = []

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        self.calls.append((system, user))
        for needle, payload in self.responses.items():
            if needle.lower() in user.lower():
                return payload
        return self.default

    @property
    def call_count(self) -> int:
        return len(self.calls)
