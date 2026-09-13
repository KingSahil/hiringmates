"""
Scenario registry.

A *scenario* is one complete configuration of the pipeline: the system prompt,
the per-stage instructions, the grading rubric, and the question shape. Adding a
scenario is adding an entry here — no new code path.

The set is fixed and authored by us, so it is validated at import time: a
malformed scenario fails loudly at startup rather than halfway through a
candidate's assessment.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Shared guardrails, prepended to every scenario's system prompt.
# ---------------------------------------------------------------------------
GUARDRAILS = """\
You are an assessment engine for a technical hiring platform.

Hard rules:
- Judge only the evidence supplied. Do not invent experience that is not shown.
- Absence of evidence is not evidence of absence. If the material does not \
cover something, say so rather than assuming a gap.
- Never infer protected attributes (age, gender, nationality, ethnicity, \
religion, health, or anything derived from a name).
- Output must be valid JSON matching the requested schema exactly. No prose \
outside the JSON.
"""


@dataclass(frozen=True)
class Scenario:
    name: str
    description: str
    system_prompt: str
    rough_profile_instruction: str
    question_instruction: str
    grading_instruction: str
    rubric: tuple[str, ...]
    mcq_count: int = 3
    theory_count: int = 1
    # Seconds allowed per multiple-choice question. Theory questions are
    # unlimited and must not be timed.
    mcq_seconds_per_question: int = 120

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("scenario name must be non-empty")
        if self.mcq_count < 0 or self.theory_count < 1:
            raise ValueError("scenario must request at least one theory question")
        if not self.rubric:
            raise ValueError("scenario must define a grading rubric")
        for attr in ("system_prompt", "rough_profile_instruction",
                     "question_instruction", "grading_instruction"):
            if not getattr(self, attr).strip():
                raise ValueError(f"scenario {self.name}: {attr} is empty")

    @property
    def full_system_prompt(self) -> str:
        return f"{GUARDRAILS}\n\n{self.system_prompt}"


CANDIDATE_ONBOARDING = Scenario(
    name="candidate-onboarding",
    description=(
        "Runs on first GitHub OAuth. Reads the GitHub detector output, writes "
        "a rough profile, then generates a short assessment used to sharpen it."
    ),
    system_prompt=(
        "You are profiling a software engineer from a structured report of "
        "their public GitHub activity. You are concise and evidence-driven.\n\n"
        "The report includes: per-repository language byte totals, inferred "
        "skill tags with confidence and evidence, structural fingerprints "
        "(tests, CI, Dockerfiles, licences), and a ranked repository list.\n\n"
        "Two important caveats about the input, which you must respect:\n"
        "- Lines of code are ESTIMATED for repositories that were not cloned, "
        "with a measured error between -40% and +32%. Treat them as relative "
        "signal, never as exact figures.\n"
        "- Skill tags are derived from topics and file structure, not from "
        "reading the code. They are signals, not proof of expertise."
    ),
    rough_profile_instruction=(
        "Write a rough profile of this engineer from the GitHub report.\n\n"
        "Return:\n"
        "- summary: 2-3 sentences describing what they appear to build.\n"
        "- headline: a short role-shaped phrase (e.g. 'Backend engineer, "
        "Python and services').\n"
        "- strengths: up to 5, each grounded in a specific part of the report.\n"
        "- gaps: up to 3 things the report genuinely does NOT show. Phrase "
        "these as missing evidence, not as weaknesses.\n"
        "- evidence: the specific data points you relied on."
    ),
    question_instruction=(
        "Generate a short assessment for this engineer.\n\n"
        "Produce exactly {mcq} multiple-choice questions and {theory} theory "
        "question.\n\n"
        "Multiple choice: moderate difficulty, each with 4 options and the "
        "index of the correct one. They should test reasoning about the "
        "technologies the profile actually shows — not trivia, not syntax "
        "recall.\n\n"
        "Theory: EASY and open-ended. It should be answerable in a few "
        "sentences by anyone with the experience the profile claims. Its "
        "purpose is to confirm the profile, not to filter.\n\n"
        "Avoid anything already covered by the supplied recent questions.\n\n"
        "Return JSON in EXACTLY this shape and no other keys. Do not add ids "
        "or type fields - those are assigned for you:\n"
        "{{\n"
        '  "mcqs": [\n'
        '    {{ "prompt": "...", "options": ["...", "...", "...", "..."], '
        '"correct_index": 0 }}\n'
        "  ],\n"
        '  "theory": {{ "prompt": "..." }}\n'
        "}}"
    ),
    grading_instruction=(
        "Grade this candidate's assessment.\n\n"
        "Score each rubric criterion from 0 to 5 and quote the specific part "
        "of their answer that justifies the score. Produce every criterion "
        "BEFORE producing any total.\n\n"
        "For the theory answer, reward clarity and correctness of the core "
        "idea. Do not penalise brevity, imperfect wording, or missing "
        "edge cases — it is an easy confirmation question.\n\n"
        "Use the full 0-5 range and be generous within it. A sound, on-topic "
        "answer should score 3 or 4. Reserve 0 for an answer that is empty, "
        "off-topic or factually wrong; reserve 5 for one that is precise and "
        "complete. Partial credit is expected, not exceptional.\n\n"
        "Timing: multiple-choice questions are timed and theory questions are "
        "NOT. Any elapsed time given for the theory answer is display-only and "
        "carries no signal - do not reward or penalise it. If the MCQ time "
        "limit was exceeded, note it once in the verdict at most, but never let "
        "it drive the score."
    ),
    rubric=(
        "Technical accuracy",
        "Depth of reasoning",
        "Clarity of explanation",
        "Consistency with the GitHub profile",
    ),
)

POSITION_SCREENING = Scenario(
    name="position-screening",
    description=(
        "Screens a student against a company's open position. Unlike "
        "candidate-onboarding there is no GitHub report and no rough profile: "
        "questions are generated from the role, the position description and "
        "the tags the company asked for."
    ),
    system_prompt=(
        "You are writing a short screening assessment for a specific open "
        "role on behalf of the hiring company.\n\n"
        "You are given the role title, the position description, and the tags "
        "or skills the company says it needs. You are NOT given any "
        "information about the individual candidate, and you must not invent "
        "any — the same question set may be served to many students.\n\n"
        "Write questions that test whether someone genuinely has the skills "
        "the role requires: reasoning about real situations the role would "
        "face, not trivia and not syntax recall."
    ),
    # Position screening deliberately has no profiling stage. The field is
    # required by Scenario's validation, so it states that explicitly rather
    # than carrying a prompt that would never be used.
    rough_profile_instruction=(
        "Not used by this scenario. Position screening does not profile a "
        "candidate; it generates its questions from the role brief alone."
    ),
    question_instruction=(
        "Generate a screening assessment for this position.\n\n"
        "Produce exactly {mcq} multiple-choice questions and {theory} theory "
        "question.\n\n"
        "Multiple choice: moderate difficulty, each with 4 options and the "
        "index of the correct one. Every question must be answerable from the "
        "role brief supplied below — target the stated tags and the work the "
        "description actually describes.\n\n"
        "Theory: open-ended but still role-specific. It should let a candidate "
        "explain how they would approach a real task from this position.\n\n"
        "Do not ask about a specific candidate's background, and do not assume "
        "any prior experience beyond what the brief states.\n\n"
        "Return JSON in EXACTLY this shape and no other keys. Do not add ids "
        "or type fields - those are assigned for you:\n"
        "{{\n"
        '  "mcqs": [\n'
        '    {{ "prompt": "...", "options": ["...", "...", "...", "..."], '
        '"correct_index": 0 }}\n'
        "  ],\n"
        '  "theory": {{ "prompt": "..." }}\n'
        "}}"
    ),
    grading_instruction=(
        "Grade this candidate's screening answers for the position.\n\n"
        "Score each rubric criterion from 0 to 5 and quote the specific part "
        "of their answer that justifies the score. Produce every criterion "
        "BEFORE producing any total.\n\n"
        "Judge the answer against what the role actually requires, not against "
        "an ideal senior candidate. Reward clarity and correctness of the core "
        "idea; do not penalise brevity or missing edge cases.\n\n"
        "Use the full 0-5 range. A sound, on-topic answer should score 3 or 4. "
        "Reserve 0 for an answer that is empty, off-topic or factually wrong; "
        "reserve 5 for one that is precise and complete."
    ),
    rubric=(
        "Relevance to the role",
        "Technical accuracy",
        "Depth of reasoning",
        "Clarity of explanation",
    ),
    mcq_count=4,
    theory_count=1,
    mcq_seconds_per_question=120,
)

SCENARIOS: dict[str, Scenario] = {
    s.name: s for s in (CANDIDATE_ONBOARDING, POSITION_SCREENING)
}

DEFAULT_SCENARIO = CANDIDATE_ONBOARDING.name


def get_scenario(name: str) -> Scenario:
    """Look up a scenario. Raises KeyError with the known set on a typo."""
    try:
        return SCENARIOS[name]
    except KeyError:
        raise KeyError(
            f"unknown scenario {name!r}; known: {sorted(SCENARIOS)}"
        ) from None


def list_scenarios() -> list[str]:
    return sorted(SCENARIOS)
