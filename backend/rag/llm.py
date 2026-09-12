"""
LLM access.

Everything goes through `complete_model`, which asks for JSON and validates it
into a pydantic model. Three providers ship, all behind the same interface:

* `GeminiLLM`          - Google GenAI (default, per the locked decision)
* `OpenAICompatLLM`    - any OpenAI chat-completions endpoint
* `AnthropicCompatLLM` - Anthropic Messages API or a proxy mirroring it
* `FakeLLM`            - canned responses, for tests

Nothing imports the SDKs at module scope, so a missing key or uninstalled
package degrades to a clear error rather than an import crash.
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


def _parse_json(text: str, source: str) -> dict[str, Any]:
    """Parse model output, tolerating a fenced code block."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Strip ```json ... ``` wrappers some models emit despite instructions.
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise LLMError(
            f"{source} returned non-JSON output ({e}): {text[:200]!r}"
        ) from e


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
        return _parse_json(text, "Gemini")


class OpenAICompatLLM(LLMClient):
    """
    Any endpoint speaking the OpenAI chat-completions wire format.

    That includes OpenAI itself, OpenRouter, Groq, Together, Fireworks, vLLM,
    Ollama and LM Studio. Point `base_url` at the server and set `model` to
    whatever it serves — nothing here is OpenAI-specific beyond the format.

    `json_mode` sends `response_format={"type": "json_object"}`. Most
    compatible servers support or ignore it; set it False for those that
    reject it.
    """

    def __init__(self, api_key: str, model: str,
                 base_url: str | None = None,
                 temperature: float = 0.2,
                 json_mode: bool = True,
                 timeout_seconds: float = 60.0) -> None:
        if not api_key:
            raise LLMError("OPENAI_API_KEY is empty")
        if not model:
            raise LLMError("OPENAI_MODEL is empty")
        self._model = model
        self._temperature = temperature
        self._json_mode = json_mode
        try:
            from openai import OpenAI
        except ImportError as e:  # pragma: no cover
            raise LLMError(
                "openai is not installed; run `pip install openai`"
            ) from e
        self._client = OpenAI(api_key=api_key, base_url=base_url or None,
                              timeout=timeout_seconds)

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": self._temperature,
        }
        if self._json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = self._client.chat.completions.create(**kwargs)
        except Exception as e:
            raise LLMError(
                f"OpenAI-compatible call failed: {type(e).__name__}: {e}"
            ) from e

        choices = getattr(response, "choices", None) or []
        if not choices:
            raise LLMError("OpenAI-compatible endpoint returned no choices")
        text = choices[0].message.content
        if not text:
            raise LLMError("OpenAI-compatible endpoint returned empty content")
        return _parse_json(text, "OpenAI-compatible endpoint")


class AnthropicCompatLLM(LLMClient):
    """
    Anthropic Messages API, or any proxy mirroring it.

    Two API differences worth knowing:
    - `max_tokens` is REQUIRED, so it is always sent.
    - There is no JSON mode. Correctness rests entirely on the guardrails
      prompt, which is why `_parse_json` tolerates fenced blocks.
    """

    def __init__(self, api_key: str, model: str,
                 base_url: str | None = None,
                 max_tokens: int = 4096,
                 temperature: float = 0.2,
                 timeout_seconds: float = 60.0) -> None:
        if not api_key:
            raise LLMError("ANTHROPIC_API_KEY is empty")
        if not model:
            raise LLMError("ANTHROPIC_MODEL is empty")
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature
        try:
            from anthropic import Anthropic
        except ImportError as e:  # pragma: no cover
            raise LLMError(
                "anthropic is not installed; run `pip install anthropic`"
            ) from e
        self._client = Anthropic(api_key=api_key, base_url=base_url or None,
                                 timeout=timeout_seconds)

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        try:
            response = self._client.messages.create(
                model=self._model,
                system=system,
                messages=[{"role": "user", "content": user}],
                max_tokens=self._max_tokens,
                temperature=self._temperature,
            )
        except Exception as e:
            raise LLMError(
                f"Anthropic-compatible call failed: {type(e).__name__}: {e}"
            ) from e

        blocks = getattr(response, "content", None) or []
        text = "".join(
            getattr(block, "text", "")
            for block in blocks
            if getattr(block, "type", "") == "text"
        )
        if not text:
            raise LLMError("Anthropic-compatible endpoint returned no text")
        return _parse_json(text, "Anthropic-compatible endpoint")


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


PROVIDERS = ("gemini", "openai", "anthropic")


def build_llm(settings: Any) -> LLMClient:
    """
    Build the configured provider.

    `settings` is a `rag.config.Settings`; typed loosely to avoid importing
    config here. Unknown providers raise with the valid set.
    """
    provider = str(getattr(settings, "llm_provider", "gemini")).strip().lower()
    logger.info("LLM provider: %s", provider)

    if provider == "gemini":
        return GeminiLLM(settings.gemini_api_key, settings.gemini_model)
    if provider == "openai":
        return OpenAICompatLLM(
            api_key=settings.openai_api_key,
            model=settings.openai_model,
            base_url=settings.openai_base_url or None,
            json_mode=settings.openai_json_mode,
        )
    if provider == "anthropic":
        return AnthropicCompatLLM(
            api_key=settings.anthropic_api_key,
            model=settings.anthropic_model,
            base_url=settings.anthropic_base_url or None,
            max_tokens=settings.anthropic_max_tokens,
        )
    raise LLMError(f"unknown LLM_PROVIDER {provider!r}; expected one of {PROVIDERS}")
