"""
Pipeline: the fixed stage machine that every scenario runs through.

    pending -> awaiting (extraction, rough profile, questions)
    awaiting -> complete (answers, grading, enhanced profile)

Two deliberate choices:

1. **MCQ scoring is deterministic.** Correct answers are known, so they are
   compared in code. Only the theory answer needs a model, which keeps the
   expensive, high-variance step to a minimum.
2. **Timing is server-recorded.** `served_at` is stamped when questions are
   handed out and elapsed time is computed on receipt. A client-supplied
   duration would be trivially faked.
"""

from __future__ import annotations

import json
import logging
import subprocess
import sys
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from rag.llm import LLMClient, LLMError
from rag.models import (
    Answer,
    EnhancedProfile,
    Extraction,
    Grade,
    Identity,
    Question,
    QuestionSet,
    RawQuestionSet,
    RoughProfile,
    Session,
    SkillTag,
    utcnow,
)
from rag.scenarios import DEFAULT_SCENARIO, Scenario, get_scenario
from rag.store import Store

logger = logging.getLogger("rag.pipeline")


class DetectorError(RuntimeError):
    pass


class Detector(ABC):
    @abstractmethod
    def extract(self, handle: str, token: str | None = None,
                top_n: int = 0) -> dict[str, Any]:
        """Return the raw GitHub detector report for *handle*."""


class SubprocessDetector(Detector):
    """
    Runs the detector in a subprocess and reads JSON from stdout.

    Kept out-of-process because the detector is slow (roughly 5-28s depending
    on repository count) and must never block the auth redirect. Replace with
    an in-process worker if the startup cost ever matters.
    """

    def __init__(self, script: str | Path, python: str | None = None,
                 timeout: float = 180.0) -> None:
        self._script = str(script)
        self._python = python or sys.executable
        self._timeout = timeout

    def extract(self, handle: str, token: str | None = None,
                top_n: int = 0) -> dict[str, Any]:
        import os

        env = dict(os.environ)
        if token:
            env["GITHUB_TOKEN"] = token
        try:
            proc = subprocess.run(
                [self._python, self._script, handle, "--top-n", str(top_n)],
                capture_output=True, text=True, encoding="utf-8",
                timeout=self._timeout, env=env,
            )
        except subprocess.TimeoutExpired as e:
            raise DetectorError(f"detector timed out after {self._timeout}s") from e
        if proc.returncode != 0:
            raise DetectorError(
                f"detector exited {proc.returncode}: {proc.stderr.strip()[:400]}"
            )
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as e:
            raise DetectorError(f"detector returned non-JSON: {e}") from None


class FakeDetector(Detector):
    def __init__(self, payload: dict[str, Any] | None = None) -> None:
        self.payload = payload or {"handle": "fake", "tags": {"all": []},
                                   "repositories": []}
        self.calls: list[str] = []
        self.top_n_calls: list[int] = []

    def extract(self, handle: str, token: str | None = None,
                top_n: int = 0) -> dict[str, Any]:
        self.calls.append(handle)
        self.top_n_calls.append(top_n)
        return self.payload


class Pipeline:
    def __init__(self, llm: LLMClient, store: Store, detector: Detector,
                 ttl_days: int = 30, clone_top_n: int = 10) -> None:
        self.llm = llm
        self.store = store
        self.detector = detector
        self.ttl_days = ttl_days
        # Repositories shallow-cloned for exact LOC, as a background step after
        # the rough profile so profiling is never gated on clone time.
        self.clone_top_n = clone_top_n

    # ---------------------------------------------------------------- start
    def create_session(self, identity: Identity,
                       scenario: str = DEFAULT_SCENARIO) -> Session:
        get_scenario(scenario)  # fail fast on a typo
        session = Session(identity=identity, scenario=scenario, status="pending")
        self.store.put_session(session)
        return session

    # -------------------------------------------------------------- advance
    def advance(self, session_id: str) -> Session:
        """Move the session forward one stage. Idempotent-safe on re-entry."""
        session = self._load(session_id)

        if session.status == "pending":
            self._extract(session)
            self._profile(session)
            self._serve_questions(session)
            # Persist now so the client sees the questions immediately...
            self.store.put_session(session)
            # ...then clone, which takes minutes. Deliberately after the
            # questions are visible, not before.
            self._clone(session)
        elif session.status == "awaiting" or session.status == "complete":
            return session  # nothing to do until answers arrive

        self.store.put_session(session)
        return session

    def _clone(self, session: Session) -> None:
        """
        Shallow-clone the top N repositories for exact line counts.

        Runs after the questions are already served, so a slow clone never
        delays the candidate. Failures are logged, not fatal: the tree-based
        estimate is still a valid fallback.
        """
        if self.clone_top_n <= 0 or session.status == "failed":
            return
        # A cache hit means the detector never ran, so there is nothing new to
        # clone — the previous run already did it for this identity.
        if session.extraction is not None and session.extraction.source == "cache":
            logger.info("cache hit: skipping clone for %s", session.id)
            return
        try:
            payload = self.detector.extract(
                session.identity.github_handle,
                token=session.identity.provider_token,
                top_n=self.clone_top_n,
            )
        except Exception as e:
            logger.warning("clone step failed for %s: %s", session.id, e)
            return
        session.cloned = payload.get("cloned") or []
        logger.info("cloned %d repos for %s", len(session.cloned), session.id)

    def _mcq_timing(self, session: Session) -> tuple[float | None, float | None, bool]:
        """
        MCQs are timed per question; theory is unlimited and never timed.

        Returns (elapsed_seconds, allowed_seconds, over_limit).
        """
        if session.served_at is None or session.question_set is None:
            return None, None, False
        count = len(session.question_set.mcqs)
        if count == 0:
            return None, None, False
        scenario = get_scenario(session.scenario)
        allowed = float(scenario.mcq_seconds_per_question * count)
        elapsed = round((utcnow() - session.served_at).total_seconds(), 2)
        return elapsed, allowed, elapsed > allowed

    def _extract(self, session: Session) -> None:
        session.status = "extracting"
        cached = self.store.get_extraction(session.identity.cache_key)
        if cached is not None and cached.is_fresh(self.ttl_days):
            session.extraction = cached.model_copy(update={"source": "cache"})
            logger.info("extraction cache hit for %s", session.identity.cache_key)
            return

        try:
            payload = self.detector.extract(
                session.identity.github_handle,
                token=session.identity.provider_token,
            )
        except Exception as e:
            session.status = "failed"
            session.error = f"extraction failed: {e}"
            logger.exception("extraction failed")
            return

        extraction = Extraction(
            cache_key=session.identity.cache_key,
            handle=session.identity.github_handle,
            detector_output=payload,
            source="detector",
        )
        self.store.put_extraction(extraction)
        session.extraction = extraction

    def _profile(self, session: Session) -> None:
        if session.status == "failed" or session.extraction is None:
            return
        scenario = get_scenario(session.scenario)
        try:
            session.rough_profile = self.llm.complete_model(
                scenario.full_system_prompt,
                self._render(scenario.rough_profile_instruction, session),
                RoughProfile,
            )
        except LLMError as e:
            session.status = "failed"
            session.error = f"profiling failed: {e}"

    def _serve_questions(self, session: Session) -> None:
        if session.status == "failed":
            return
        scenario = get_scenario(session.scenario)
        instruction = scenario.question_instruction.format(
            mcq=scenario.mcq_count, theory=scenario.theory_count,
        )
        try:
            raw = self.llm.complete_model(
                scenario.full_system_prompt,
                self._render(instruction, session),
                RawQuestionSet,
            )
        except LLMError as e:
            session.status = "failed"
            session.error = f"question generation failed: {e}"
            return
        question_set = raw.to_question_set()

        valid = [q for q in question_set.questions if q.is_valid()]
        if len(valid) < scenario.mcq_count + scenario.theory_count:
            session.status = "failed"
            session.error = (
                f"model produced {len(valid)} usable questions, expected "
                f"{scenario.mcq_count + scenario.theory_count}"
            )
            return

        session.question_set = QuestionSet(questions=valid)
        session.served_at = utcnow()
        session.status = "awaiting"

    # --------------------------------------------------------------- answers
    def submit_answers(self, session_id: str, answers: list[Answer]) -> Session:
        session = self._load(session_id)
        if session.status != "awaiting":
            return session

        session.answers = answers
        session.status = "scoring"
        scenario = get_scenario(session.scenario)

        elapsed = self._theory_elapsed(session)
        mcq_elapsed, mcq_allowed, mcq_over = self._mcq_timing(session)
        grade = self._grade_mcqs(session)
        try:
            grade = self._grade_theory(session, scenario, grade, elapsed)
        except LLMError as e:
            session.status = "failed"
            session.error = f"grading failed: {e}"
            self.store.put_session(session)
            return session

        session.enhanced = EnhancedProfile(
            session_id=session.id,
            identity=session.identity,
            rough=session.rough_profile or RoughProfile(summary="", headline=""),
            grade=grade,
            theory_elapsed_seconds=elapsed,
            mcq_elapsed_seconds=mcq_elapsed,
            mcq_seconds_allowed=mcq_allowed,
            mcq_over_limit=mcq_over,
            cloned=list(session.cloned),
            summary=grade.verdict,
            tags=self._tags(session),
            skills=self._skills(session),
            questions_served=list(session.question_set.questions)
            if session.question_set else [],
        )
        session.status = "complete"
        self.store.put_enhanced_profile(session.enhanced)
        self.store.put_session(session)
        return session

    # --------------------------------------------------------------- helpers
    def _theory_elapsed(self, session: Session) -> float | None:
        """Server-side elapsed time for the theory question."""
        if session.served_at is None or session.question_set is None:
            return None
        theory = session.question_set.theory
        if theory is None:
            return None
        if not any(a.question_id == theory.id for a in session.answers):
            return None  # unanswered; no timing signal
        return round((utcnow() - session.served_at).total_seconds(), 2)

    def _grade_mcqs(self, session: Session) -> Grade:
        by_id = {q.id: q for q in (session.question_set.questions
                                   if session.question_set else [])}
        correct = 0
        total = 0
        for answer in session.answers:
            q = by_id.get(answer.question_id)
            if q is None or q.kind != "mcq":
                continue
            total += 1
            if (answer.selected_index is not None
                    and answer.selected_index == q.correct_index):
                correct += 1
        return Grade(mcq_correct=correct, mcq_total=total)

    def _grade_theory(self, session: Session, scenario: Scenario,
                      grade: Grade, elapsed: float | None) -> Grade:
        theory = session.question_set.theory if session.question_set else None
        if theory is None:
            return grade
        answer = next((a for a in session.answers
                       if a.question_id == theory.id), None)
        if answer is None or not answer.text.strip():
            grade.verdict = "Theory question unanswered."
            return grade

        prompt = self._render(scenario.grading_instruction, session)
        prompt += (
            f"\n\nRubric criteria: {', '.join(scenario.rubric)}\n"
            f"Theory question: {theory.prompt}\n"
            f"Candidate answer: {answer.text}\n"
            f"Elapsed seconds: {elapsed}\n"
            f"MCQ score so far: {grade.mcq_correct}/{grade.mcq_total}\n\n"
            "Return {\"criteria\": [{\"criterion\", \"score\", \"evidence\"}], "
            "\"total\": <float 0-5>, \"verdict\": <string>}."
        )
        graded = self.llm.complete_model(
            scenario.full_system_prompt, prompt, Grade)
        graded.mcq_correct = grade.mcq_correct
        graded.mcq_total = grade.mcq_total
        return graded

    @staticmethod
    def _tag_block(session: Session) -> dict[str, Any]:
        output = session.extraction.detector_output if session.extraction else {}
        return output.get("tags") or {}

    def _tags(self, session: Session) -> list[str]:
        return list(self._tag_block(session).get("all") or [])

    def _skills(self, session: Session) -> list[SkillTag]:
        """Inferred skills with their evidence, so each tag can be defended."""
        raw = self._tag_block(session).get("skills") or []
        return [SkillTag.model_validate(item) for item in raw]

    def _render(self, instruction: str, session: Session) -> str:
        output = session.extraction.detector_output if session.extraction else {}
        profile = (session.rough_profile.model_dump()
                   if session.rough_profile else {})
        # Anti-repeat: what this candidate has already been asked.
        recent = self.store.recent_question_prompts(session.identity.user_id)
        return (
            f"{instruction}\n\n"
            f"--- GitHub report (JSON) ---\n{json.dumps(output, default=str)[:12000]}\n"
            f"--- Rough profile (JSON) ---\n{json.dumps(profile, default=str)}\n"
            f"--- Recently served questions (avoid repeating) ---\n"
            f"{chr(10).join('- ' + p for p in recent) or '(none)'}\n"
        )

    def _load(self, session_id: str) -> Session:
        session = self.store.get_session(session_id)
        if session is None:
            raise KeyError(f"unknown session {session_id}")
        return session
