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
        "Avoid anything already covered by the supplied recent questions."
    ),
    grading_instruction=(
        "Grade this candidate's assessment.\n\n"
        "Score each rubric criterion from 0 to 5 and quote the specific part "
        "of their answer that justifies the score. Produce every criterion "
        "BEFORE producing any total.\n\n"
        "For the theory answer, reward clarity and correctness of the core "
        "idea. Do not penalise brevity, imperfect wording, or missing "
        "edge cases — it is an easy confirmation question.\n\n"
        "Note the supplied elapsed time for the theory question. Interpret it "
        "as a weak signal only: fast can mean fluent, slow can mean careful. "
        "Never let it outweigh correctness."
    ),
    rubric=(
        "Technical accuracy",
        "Depth of reasoning",
        "Clarity of explanation",
        "Consistency with the GitHub profile",
    ),
)

SCENARIOS: dict[str, Scenario] = {
    s.name: s for s in (CANDIDATE_ONBOARDING,)
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
