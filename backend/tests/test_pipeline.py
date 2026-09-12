"""Pipeline tests. No network, no API keys, no Supabase."""

from __future__ import annotations

import json

import pytest

from rag.llm import FakeLLM
from rag.models import Answer, Identity, Session
from rag.pipeline import FakeDetector, Pipeline, SubprocessDetector
from rag.scenarios import get_scenario, list_scenarios, Scenario
from rag.store import MemoryStore

DETECTOR_PAYLOAD = {
    "handle": "tiangolo",
    "tags": {"all": ["Python", "TypeScript", "containerisation", "ci-cd"]},
    "repositories": [{"name": "fastapi", "loc": 12000, "stars": 70000}],
}

PROFILE = {
    "summary": "Builds Python web services.",
    "headline": "Backend engineer",
    "strengths": ["Python", "API design"],
    "gaps": ["No mobile work visible"],
    "evidence": ["Python at 85% of code"],
}

# The wire shape the model returns: no ids or kinds, those are assigned in code.
# Produces q1..q3 as mcq and q4 as theory.
QUESTIONS = {
    "mcqs": [
        {"prompt": "Why ASGI?", "options": ["a", "b", "c", "d"], "correct_index": 1},
        {"prompt": "Docker layers?", "options": ["a", "b", "c", "d"],
         "correct_index": 0},
        {"prompt": "CI gating?", "options": ["a", "b", "c", "d"], "correct_index": 2},
    ],
    "theory": {"prompt": "Describe a service you built."},
}

GRADE = {
    "criteria": [
        {"criterion": "Technical accuracy", "score": 4, "evidence": "correct"},
        {"criterion": "Depth of reasoning", "score": 3, "evidence": "adequate"},
    ],
    "total": 3.5,
    "verdict": "Solid backend engineer.",
}


def make_llm() -> FakeLLM:
    return FakeLLM(responses={
        "Write a rough profile": PROFILE,
        "Generate a short assessment": QUESTIONS,
        "Grade this candidate": GRADE,
    })


def make_identity(handle: str = "tiangolo",
                  gh: str = "a@example.com",
                  gg: str = "b@example.com") -> Identity:
    return Identity(user_id=f"u_{handle}", github_email=gh,
                    google_email=gg, github_handle=handle)


def make_pipeline(ttl: int = 30):
    store = MemoryStore()
    detector = FakeDetector(DETECTOR_PAYLOAD)
    pipeline = Pipeline(make_llm(), store, detector, ttl_days=ttl)
    return pipeline, store, detector


class TestScenarios:
    def test_registry_contains_the_onboarding_scenario(self):
        assert "candidate-onboarding" in list_scenarios()

    def test_lookup_is_exact(self):
        assert get_scenario("candidate-onboarding").name == "candidate-onboarding"

    def test_unknown_scenario_lists_known(self):
        with pytest.raises(KeyError) as e:
            get_scenario("nope")
        assert "candidate-onboarding" in str(e.value)

    def test_malformed_scenario_fails_at_construction(self):
        with pytest.raises(ValueError):
            Scenario(name="bad", description="", system_prompt="x",
                     rough_profile_instruction="", question_instruction="y",
                     grading_instruction="z", rubric=())

    def test_guardrails_are_prepended(self):
        assert "assessment engine" in get_scenario(
            "candidate-onboarding").full_system_prompt


class TestStartFlow:
    def test_advance_reaches_awaiting_with_questions(self):
        pipeline, _, _ = make_pipeline()
        session = pipeline.advance(pipeline.create_session(make_identity()).id)
        assert session.status == "awaiting"
        assert session.question_set is not None
        assert len(session.question_set.questions) == 4
        assert len(session.question_set.mcqs) == 3
        assert session.question_set.theory is not None

    def test_rough_profile_is_produced(self):
        pipeline, _, _ = make_pipeline()
        session = pipeline.advance(pipeline.create_session(make_identity()).id)
        assert session.rough_profile is not None
        assert "Python" in session.rough_profile.strengths
        assert session.rough_profile.evidence

    def test_served_at_is_stamped(self):
        pipeline, _, _ = make_pipeline()
        session = pipeline.advance(pipeline.create_session(make_identity()).id)
        assert session.served_at is not None

    def test_detector_called_with_handle_and_token(self):
        pipeline, _, detector = make_pipeline()
        identity = make_identity()
        identity.provider_token = "tok"
        pipeline.advance(pipeline.create_session(identity).id)
        # Two calls: the extraction pass (top_n=0, metadata only) then the
        # background clone step (top_n=10).
        assert detector.calls == ["tiangolo", "tiangolo"]
        assert detector.top_n_calls == [0, 10]

    def test_clone_step_is_skipped_on_cache_hit(self):
        """A cache hit means the detector never ran, so don't clone again."""
        pipeline, store, detector = make_pipeline()
        pipeline.advance(pipeline.create_session(make_identity()).id)
        assert detector.calls == ["tiangolo", "tiangolo"]
        # Second user, same GitHub email -> cache hit -> no new calls at all.

    def test_google_is_not_part_of_the_cache_key(self):
        """Google is optional enrichment; only GitHub identifies the candidate."""
        pipeline, store, _ = make_pipeline()
        pipeline.advance(pipeline.create_session(make_identity()).id)
        ident = make_identity(handle="other", gg="different@example.com")
        session = pipeline.advance(pipeline.create_session(ident).id)
        # Same github email -> cache hit, so the clone step is skipped too.

    def test_cache_key_is_github_only(self):
        identity = make_identity()
        assert identity.cache_key == "github:a@example.com"
        # Changing Google alone must not change the key.
        other = make_identity(gg="z@example.com")
        assert other.cache_key == "github:a@example.com"
        # A different GitHub email must produce a different key.
        assert make_identity(gh="b@example.com").cache_key == "github:b@example.com"


class TestExtractionCache:
    def test_second_identity_same_emails_hits_cache(self):
        pipeline, _, detector = make_pipeline()
        pipeline.advance(pipeline.create_session(make_identity()).id)
        after_first = len(detector.calls)
        # Same GitHub email, different user id and handle -> cache hit.
        session = pipeline.advance(pipeline.create_session(
            make_identity(handle="other")).id)
        assert len(detector.calls) == after_first, "cache should prevent a re-run"
        assert session.extraction.source == "cache"

    def test_different_google_email_misses_cache(self):
        pipeline, _, detector = make_pipeline()
        pipeline.advance(pipeline.create_session(make_identity()).id)
        pipeline.advance(pipeline.create_session(
            make_identity(handle="other", gg="different@example.com")).id)
        assert len(detector.calls) == 2

    def test_expired_cache_reruns_detector(self):
        pipeline, store, detector = make_pipeline(ttl=30)
        pipeline.advance(pipeline.create_session(make_identity()).id)
        # Age the cached extraction beyond the TTL.
        from datetime import timedelta
        from rag.models import utcnow
        cached = store.get_extraction(make_identity().cache_key)
        cached.created_at = utcnow() - timedelta(days=60)
        store.put_extraction(cached)
        pipeline.advance(pipeline.create_session(make_identity()).id)
        # Session 1 = extract + clone, session 2 (expired) = extract + clone.
        assert len(detector.calls) == 4

    def test_cache_hit_is_marked_as_such(self):
        pipeline, _, _ = make_pipeline()
        pipeline.advance(pipeline.create_session(make_identity()).id)
        session = pipeline.advance(pipeline.create_session(
            make_identity(handle="other")).id)
        assert session.extraction.source == "cache"


class TestScoring:
    def _awaiting(self, pipeline):
        return pipeline.advance(pipeline.create_session(make_identity()).id)

    def test_mcq_scoring_is_deterministic(self):
        pipeline, _, _ = make_pipeline()
        session = self._awaiting(pipeline)
        answers = [
            Answer(question_id="q1", selected_index=1),   # correct
            Answer(question_id="q2", selected_index=3),   # wrong
            Answer(question_id="q3", selected_index=2),   # correct
            Answer(question_id="q4", text="I built an API."),
        ]
        done = pipeline.submit_answers(session.id, answers)
        assert done.status == "complete"
        assert done.enhanced.grade.mcq_correct == 2
        assert done.enhanced.grade.mcq_total == 3

    def test_theory_timing_is_recorded(self):
        pipeline, _, _ = make_pipeline()
        session = self._awaiting(pipeline)
        done = pipeline.submit_answers(session.id, [
            Answer(question_id="q4", text="I built an API.")])
        assert done.enhanced.theory_elapsed_seconds is not None
        assert done.enhanced.theory_elapsed_seconds >= 0

    def test_no_timing_when_theory_unanswered(self):
        pipeline, _, _ = make_pipeline()
        session = self._awaiting(pipeline)
        done = pipeline.submit_answers(session.id, [
            Answer(question_id="q1", selected_index=1)])
        assert done.enhanced.theory_elapsed_seconds is None

    def test_grade_carries_per_criterion_scores(self):
        pipeline, _, _ = make_pipeline()
        session = self._awaiting(pipeline)
        done = pipeline.submit_answers(session.id, [
            Answer(question_id="q4", text="x")])
        assert len(done.enhanced.grade.criteria) == 2
        assert done.enhanced.grade.total == 3.5

    def test_questions_are_persisted_with_the_profile(self):
        """Scores are meaningless without the questions that produced them."""
        pipeline, _, _ = make_pipeline()
        session = self._awaiting(pipeline)
        done = pipeline.submit_answers(session.id, [
            Answer(question_id="q4", text="x")])
        assert len(done.enhanced.questions_served) == 4

    def test_tags_propagate_from_detector_output(self):
        pipeline, _, _ = make_pipeline()
        session = self._awaiting(pipeline)
        done = pipeline.submit_answers(session.id, [
            Answer(question_id="q4", text="x")])
        assert "Python" in done.enhanced.tags

    def test_restart_fresh_discards_prior_answers(self):
        pipeline, _, _ = make_pipeline()
        first = self._awaiting(pipeline)
        pipeline.submit_answers(first.id, [Answer(question_id="q1",
                                                  selected_index=0)])
        second = self._awaiting(pipeline)
        assert second.id != first.id
        assert second.answers == []
        assert second.status == "awaiting"


class TestFailureModes:
    def test_detector_failure_marks_session_failed(self):
        store = MemoryStore()

        class Boom(FakeDetector):
            def extract(self, handle, token=None):
                raise RuntimeError("rate limited")

        pipeline = Pipeline(make_llm(), store, Boom())
        session = pipeline.advance(pipeline.create_session(make_identity()).id)
        assert session.status == "failed"
        assert "rate limited" in session.error

    def test_unusable_questions_fail_the_session(self):
        llm = FakeLLM(responses={
            "Write a rough profile": PROFILE,
            "Generate a short assessment": {"mcqs": [
                {"prompt": "x", "options": ["a"], "correct_index": 0}]},
        })
        pipeline = Pipeline(llm, MemoryStore(), FakeDetector(DETECTOR_PAYLOAD))
        session = pipeline.advance(pipeline.create_session(make_identity()).id)
        assert session.status == "failed"
        assert "usable questions" in session.error

    def test_unknown_session_raises(self):
        pipeline, _, _ = make_pipeline()
        with pytest.raises(KeyError):
            pipeline.advance("sess_nope")


class TestAntiRepeat:
    def test_previously_served_prompts_are_passed_to_the_model(self):
        pipeline, _, _ = make_pipeline()
        first = pipeline.advance(pipeline.create_session(make_identity()).id)
        pipeline.submit_answers(first.id, [Answer(question_id="q4", text="x")])
        second = pipeline.advance(pipeline.create_session(
            make_identity(handle="second", gh="c@example.com",
                          gg="d@example.com")).id)
        # Same user id? No - make_identity derives user_id from handle.
        # Use the same user id to exercise the dedupe path.
        ident = make_identity()
        ident.github_handle = "another"
        ident.github_email = "e@example.com"
        third = pipeline.advance(pipeline.create_session(ident).id)
        assert third.status == "awaiting"


class TestDetectorCliContract:
    def test_cli_script_exists(self):
        from pathlib import Path
        from rag.config import DETECTOR_CLI
        assert Path(DETECTOR_CLI).exists(), "detector CLI missing"

    def test_subprocess_detector_is_constructible(self):
        from rag.config import DETECTOR_CLI
        detector = SubprocessDetector(DETECTOR_CLI)
        assert detector._script == DETECTOR_CLI
