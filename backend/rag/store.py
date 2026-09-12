"""
Persistence.

The backend talks to a `Store`, never to Supabase directly. That keeps the
pipeline testable without credentials and makes the eventual schema explicit.

Two implementations:
* `MemoryStore`    - in-process, used by tests and local runs.
* `SupabaseStore`  - real Postgres via the service-role client. Imported lazily
  so the package imports cleanly when `supabase` is not installed.

Reminder: RLS protects direct client access. This service uses the service-role
key, which bypasses RLS, so tenant isolation must ALSO be enforced here.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from rag.models import EnhancedProfile, Extraction, Session

logger = logging.getLogger("rag.store")


class Store(ABC):
    # --- extraction cache -------------------------------------------------
    @abstractmethod
    def get_extraction(self, cache_key: str) -> Extraction | None:
        ...

    @abstractmethod
    def put_extraction(self, extraction: Extraction) -> None:
        ...

    # --- sessions ---------------------------------------------------------
    @abstractmethod
    def get_session(self, session_id: str) -> Session | None:
        ...

    @abstractmethod
    def put_session(self, session: Session) -> None:
        ...

    # --- durable profiles -------------------------------------------------
    @abstractmethod
    def put_enhanced_profile(self, profile: EnhancedProfile) -> None:
        ...

    @abstractmethod
    def get_enhanced_profile(self, user_id: str) -> EnhancedProfile | None:
        ...

    # --- question freshness (dedupe seam) ---------------------------------
    @abstractmethod
    def recent_question_prompts(self, user_id: str, limit: int = 25) -> list[str]:
        """Prompts already served to this user, newest first."""


class MemoryStore(Store):
    """In-process store. Not durable; for tests and local development."""

    def __init__(self) -> None:
        self.extractions: dict[str, Extraction] = {}
        self.sessions: dict[str, Session] = {}
        self.profiles: dict[str, EnhancedProfile] = {}
        self.served: dict[str, list[str]] = {}

    def get_extraction(self, cache_key: str) -> Extraction | None:
        return self.extractions.get(cache_key)

    def put_extraction(self, extraction: Extraction) -> None:
        self.extractions[extraction.cache_key] = extraction

    def get_session(self, session_id: str) -> Session | None:
        return self.sessions.get(session_id)

    def put_session(self, session: Session) -> None:
        session.touch()
        self.sessions[session.id] = session

    def put_enhanced_profile(self, profile: EnhancedProfile) -> None:
        self.profiles[profile.identity.user_id] = profile
        self.served.setdefault(profile.identity.user_id, []).extend(
            q.prompt for q in profile.questions_served
        )

    def get_enhanced_profile(self, user_id: str) -> EnhancedProfile | None:
        return self.profiles.get(user_id)

    def recent_question_prompts(self, user_id: str, limit: int = 25) -> list[str]:
        return self.served.get(user_id, [])[-limit:]


class SupabaseStore(Store):
    """
    Postgres-backed store.

    Table contract (to be created by migration):
        extractions(cache_key text primary key, handle text,
                    detector_output jsonb, created_at timestamptz)
        sessions(id text primary key, user_id text, scenario text,
                 status text, payload jsonb, created_at, updated_at)
        candidate_profiles(user_id text primary key, payload jsonb,
                           created_at timestamptz)
        served_questions(user_id text, prompt text, created_at timestamptz)
    """

    def __init__(self, url: str, service_role_key: str) -> None:
        if not url or not service_role_key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        try:
            from supabase import create_client
        except ImportError as e:
            raise RuntimeError(
                "supabase is not installed; run `pip install supabase`"
            ) from e
        self._client = create_client(url, service_role_key)

    def get_extraction(self, cache_key: str) -> Extraction | None:
        res = (self._client.table("extractions")
               .select("*").eq("cache_key", cache_key).limit(1).execute())
        rows = res.data or []
        return Extraction.model_validate(rows[0]) if rows else None

    def put_extraction(self, extraction: Extraction) -> None:
        (self._client.table("extractions").upsert(
            extraction.model_dump(mode="json")).execute())

    def get_session(self, session_id: str) -> Session | None:
        res = (self._client.table("sessions")
               .select("payload").eq("id", session_id).limit(1).execute())
        rows = res.data or []
        return Session.model_validate(rows[0]["payload"]) if rows else None

    def put_session(self, session: Session) -> None:
        session.touch()
        (self._client.table("sessions").upsert({
            "id": session.id,
            "user_id": session.identity.user_id,
            "scenario": session.scenario,
            "status": session.status,
            "payload": session.model_dump(mode="json"),
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
        }).execute())

    def put_enhanced_profile(self, profile: EnhancedProfile) -> None:
        (self._client.table("candidate_profiles").upsert({
            "user_id": profile.identity.user_id,
            "payload": profile.model_dump(mode="json"),
            "created_at": profile.created_at.isoformat(),
        }).execute())
        if profile.questions_served:
            (self._client.table("served_questions").insert([
                {"user_id": profile.identity.user_id,
                 "prompt": q.prompt,
                 "created_at": profile.created_at.isoformat()}
                for q in profile.questions_served
            ]).execute())

    def get_enhanced_profile(self, user_id: str) -> EnhancedProfile | None:
        res = (self._client.table("candidate_profiles")
               .select("payload").eq("user_id", user_id).limit(1).execute())
        rows = res.data or []
        return EnhancedProfile.model_validate(rows[0]["payload"]) if rows else None

    def recent_question_prompts(self, user_id: str, limit: int = 25) -> list[str]:
        res = (self._client.table("served_questions")
               .select("prompt").eq("user_id", user_id)
               .order("created_at", desc=True).limit(limit).execute())
        return [row["prompt"] for row in (res.data or [])]
