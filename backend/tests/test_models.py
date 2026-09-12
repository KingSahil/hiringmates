"""
Model coercion: the output shapes we accept from an LLM rather than reject.

These fields are presentational — they are displayed, never computed on. Failing
a whole profiling run because a model wrapped them differently costs far more
than the strictness buys, so the models normalise instead of raising.
"""

from rag.models import RoughProfile, SkillTag


class TestEvidenceCoercion:
    def test_list_passes_through_unchanged(self):
        profile = RoughProfile(summary="s", headline="h", evidence=["a", "b"])
        assert profile.evidence == ["a", "b"]

    def test_dict_becomes_key_value_strings(self):
        """Observed proxy behaviour: evidence returned as a dict of stats."""
        profile = RoughProfile(
            summary="s",
            headline="h",
            evidence={"total_estimated_loc": 512, "has_license_count": 1},
        )
        assert profile.evidence == [
            "total_estimated_loc: 512",
            "has_license_count: 1",
        ]

    def test_scalar_is_wrapped(self):
        profile = RoughProfile(summary="s", headline="h", evidence="one repo")
        assert profile.evidence == ["one repo"]

    def test_absent_defaults_to_empty(self):
        profile = RoughProfile(summary="s", headline="h")
        assert profile.evidence == []

    def test_items_are_stringified(self):
        profile = RoughProfile(summary="s", headline="h", evidence=[1, 2])
        assert profile.evidence == ["1", "2"]

    def test_skill_tag_follows_the_same_rule(self):
        tag = SkillTag(name="docker", evidence={"dockerfile": 3})
        assert tag.evidence == ["dockerfile: 3"]
