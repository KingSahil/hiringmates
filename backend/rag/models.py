"""
Domain models for the RAG backend.

The central design rule: **the backend never derives identity.** It receives a
fully-formed `Identity` produced by whatever auth layer is in front of it.
Wiring Supabase auth later means supplying that object, nothing else.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

SessionStatus = Literal[
    "pending",       # created, extraction not started
    "extracting",    # detector or cache lookup in flight
    "awaiting",      # questions served, waiting for answers
    "scoring",       # answers received, LLM grading
    "complete",      # enhanced profile persisted
    "failed",
]


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:20]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Identity(BaseModel):
    """
    Who the candidate is, as asserted by the auth layer.

    Both emails are required here because the extraction cache is keyed on the
    pair: a returning user is only recognised when *both* match.
    """

    user_id: str
    github_email: str
    google_email: str
    github_handle: str
    provider_token: str | None = None

    @property
    def cache_key(self) -> str:
        """Stable cache key. Emails are lowercased; ordering is fixed."""
        return f"{self.github_email.strip().lower()}|{self.google_email.strip().lower()}"


class Extraction(BaseModel):
    """Cached output of the GitHub detector, keyed by identity pair."""

    cache_key: str
    handle: str
    detector_output: dict[str, Any]
    created_at: datetime = Field(default_factory=utcnow)
    source: Literal["detector", "cache"] = "detector"

    def is_fresh(self, ttl_days: int) -> bool:
        return (utcnow() - self.created_at).days < ttl_days


class RoughProfile(BaseModel):
    """First-pass profile, generated from the detector output alone."""

    summary: str
    headline: str
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class Question(BaseModel):
    id: str
    kind: Literal["mcq", "theory"]
    prompt: str
    options: list[str] = Field(default_factory=list)
    correct_index: int | None = None

    def is_valid(self) -> bool:
        if self.kind == "mcq":
            return len(self.options) >= 2 and self.correct_index is not None \
                and 0 <= self.correct_index < len(self.options)
        return bool(self.prompt.strip())


class RawQuestion(BaseModel):
    """Content only — no identity, no typing."""

    prompt: str
    options: list[str] = Field(default_factory=list)
    correct_index: int | None = None


class RawQuestionSet(BaseModel):
    """
    The shape the model is asked to produce.

    Deliberately carries no `id` or `kind`: identity and typing are assigned
    by the code, deterministically. Asking the model to invent them gives it
    another way to be wrong — it previously returned
    `multiple_choice_questions` / `theory_question` with a `question` field,
    which validated to zero usable questions.

    Uses `RawQuestion`, not `Question`, because `Question` requires `id` and
    `kind`; parsing the raw payload straight into it fails validation.
    """

    mcqs: list[RawQuestion] = Field(default_factory=list)
    theory: RawQuestion | None = None

    def to_question_set(self) -> "QuestionSet":
        questions: list[Question] = [
            Question(
                id=f"q{i}",
                kind="mcq",
                prompt=q.prompt,
                options=q.options,
                correct_index=q.correct_index,
            )
            for i, q in enumerate(self.mcqs, start=1)
        ]
        if self.theory is not None:
            questions.append(
                Question(
                    id=f"q{len(self.mcqs) + 1}",
                    kind="theory",
                    prompt=self.theory.prompt,
                )
            )
        return QuestionSet(questions=questions)


class QuestionSet(BaseModel):
    questions: list[Question] = Field(default_factory=list)

    @property
    def mcqs(self) -> list[Question]:
        return [q for q in self.questions if q.kind == "mcq"]

    @property
    def theory(self) -> Question | None:
        for q in self.questions:
            if q.kind == "theory":
                return q
        return None


class Answer(BaseModel):
    question_id: str
    selected_index: int | None = None
    text: str = ""


class CriterionScore(BaseModel):
    criterion: str
    # Float, not int: models reliably return fractional rubric scores (3.5).
    # Rejecting those fails the whole grade over a type that carries no meaning.
    score: float = Field(ge=0, le=5)
    evidence: str = ""


class Grade(BaseModel):
    """
    Per-criterion scores are produced *before* the aggregate. That ordering is
    deliberate: it forces the model to justify each dimension, and it gives an
    auditable trail when a candidate contests the result.
    """

    criteria: list[CriterionScore] = Field(default_factory=list)
    total: float = 0.0
    verdict: str = ""
    mcq_correct: int = 0
    mcq_total: int = 0


class SkillTag(BaseModel):
    """
    An inferred skill, with the evidence behind it.

    A bare tag is not defensible if a candidate contests it, so confidence and
    evidence travel with it.
    """

    name: str
    confidence: str = "medium"
    evidence: list[str] = Field(default_factory=list)


class EnhancedProfile(BaseModel):
    """The durable artifact. Outlives the extraction cache TTL."""

    session_id: str
    identity: Identity
    rough: RoughProfile
    grade: Grade
    theory_elapsed_seconds: float | None = None
    summary: str = ""
    tags: list[str] = Field(default_factory=list)
    skills: list[SkillTag] = Field(default_factory=list)
    questions_served: list[Question] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utcnow)


class Session(BaseModel):
    id: str = Field(default_factory=lambda: new_id("sess"))
    identity: Identity
    scenario: str = "candidate-onboarding"
    status: SessionStatus = "pending"
    extraction: Extraction | None = None
    rough_profile: RoughProfile | None = None
    question_set: QuestionSet | None = None
    served_at: datetime | None = None
    answers: list[Answer] = Field(default_factory=list)
    enhanced: EnhancedProfile | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    def touch(self) -> None:
        self.updated_at = utcnow()
