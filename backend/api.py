"""
HTTP surface for the RAG backend.

Contract for the Next.js frontend:

    POST   /sessions                 create; returns 202 with status "pending"
    GET    /sessions/{id}            poll; cheap, safe to call repeatedly
    POST   /sessions/{id}/answers    submit answers; triggers grading
    GET    /profiles/{user_id}       fetch a completed enhanced profile
    GET    /health                   liveness + configuration problems

Extraction is slow (5-28s), so creation returns immediately and the heavy work
runs in a background task. The frontend polls until `status` is "awaiting"
(questions ready) or "complete".

Auth is NOT implemented here. The backend trusts an `Identity` supplied by the
caller; when Supabase auth lands in front of this service, it becomes the thing
that produces that object and calls these endpoints server-side.

NOTE: requires `fastapi` and `uvicorn`. Not installed in this environment, so
this module is written but unverified at runtime.
"""

from __future__ import annotations

import logging
import threading

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from rag.config import load_settings
from rag.llm import LLMClient, build_llm
from rag.models import Answer, Identity, PlagiarismCheckRequest
from rag.pipeline import Pipeline, SubprocessDetector
from rag.plagiarism import CopyDetectEngine
from rag.scenarios import DEFAULT_SCENARIO, list_scenarios
from rag.store import MemoryStore, Store, SupabaseStore

logger = logging.getLogger("rag.api")

app = FastAPI(title="HiringMates RAG backend", version="0.1.0")


class CreateSessionRequest(BaseModel):
    identity: Identity
    scenario: str = DEFAULT_SCENARIO


class AnswersRequest(BaseModel):
    answers: list[Answer]


def _store(settings) -> Store:
    """Supabase when configured; in-memory otherwise (local dev and tests)."""
    if settings.supabase_url and settings.supabase_service_role_key:
        return SupabaseStore(settings.supabase_url,
                             settings.supabase_service_role_key)
    logger.warning("Supabase not configured — using in-memory store")
    return MemoryStore()


_pipeline_singleton: Pipeline | None = None
_pipeline_lock = threading.Lock()


def _pipeline() -> Pipeline:
    """
    Build the pipeline once and reuse it.

    This MUST be a singleton. Originally it was constructed per request, which
    meant the in-memory store was thrown away after every call: POST /sessions
    wrote the session to a store that no longer existed by the time the client
    polled, and every GET returned 404. A Supabase-backed store would have
    masked the bug, which is exactly why it survived testing.

    Settings are read on first use; restart the service after changing them.
    """
    global _pipeline_singleton
    with _pipeline_lock:
        if _pipeline_singleton is None:
            settings = load_settings()
            llm: LLMClient = build_llm(settings)
            _pipeline_singleton = Pipeline(
                llm=llm,
                store=_store(settings),
                detector=SubprocessDetector(
                    settings.detector_cli,
                    python=settings.detector_python or None,
                    timeout=settings.detector_timeout_seconds,
                ),
                ttl_days=settings.extraction_ttl_days,
            )
        return _pipeline_singleton


@app.get("/health")
def health() -> dict:
    problems = load_settings().validate()
    return {"ok": not problems, "problems": problems,
            "scenarios": list_scenarios()}


@app.post("/sessions", status_code=202)
def create_session(request: CreateSessionRequest,
                   background: BackgroundTasks) -> dict:
    pipeline = _pipeline()
    try:
        session = pipeline.create_session(request.identity, request.scenario)
    except KeyError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    background.add_task(_advance_safely, pipeline, session.id)
    return _view(session)


@app.get("/sessions/{session_id}")
def get_session(session_id: str) -> dict:
    pipeline = _pipeline()
    # The store returns None for an unknown id; it does not raise. Check it
    # before building the view, or this becomes a 500 instead of a 404.
    session = pipeline.store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="session not found")
    return _view(session)


@app.post("/sessions/{session_id}/answers")
def submit_answers(session_id: str, request: AnswersRequest) -> dict:
    pipeline = _pipeline()
    try:
        session = pipeline.submit_answers(session_id, request.answers)
    except KeyError:
        raise HTTPException(status_code=404, detail="session not found") from None
    return _view(session)


@app.get("/profiles/{user_id}")
def get_profile(user_id: str) -> dict:
    pipeline = _pipeline()
    profile = pipeline.store.get_enhanced_profile(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")
    return profile.model_dump(mode="json")


@app.post("/plagiarism/check")
def check_plagiarism(request: PlagiarismCheckRequest) -> dict:
    pipeline = _pipeline()
    engine = CopyDetectEngine()
    result = engine.analyze(request, llm=pipeline.llm if request.run_llm else None)
    return result.model_dump(mode="json")


def _advance_safely(pipeline: Pipeline, session_id: str) -> None:
    try:
        pipeline.advance(session_id)
    except Exception:  # noqa: BLE001 - never kill the worker
        logger.exception("advance failed for %s", session_id)


def _view(session) -> dict:
    """Session view. Questions are only exposed once they are served."""
    data = session.model_dump(mode="json")
    return {
        "id": data["id"],
        "status": data["status"],
        "scenario": data["scenario"],
        "error": data["error"],
        "extraction_source": (session.extraction.source
                              if session.extraction else None),
        "rough_profile": data["rough_profile"],
        "questions": data["question_set"]["questions"]
        if data["question_set"] else [],
        "served_at": data["served_at"],
        "enhanced": data["enhanced"],
    }
