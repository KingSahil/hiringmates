"""
Tests for the MCP server surface (GitHub-only).

Covers tool registration, argument validation, and the stdout guard that
protects the stdio JSON-RPC stream. These call the tool functions directly;
``scripts/mcp_smoke_test.py`` exercises the real stdio transport end to end.
"""

from __future__ import annotations

import io
import sys

import pytest

import app.mcp_server as srv


class TestRegistration:
    def test_server_identity(self):
        assert srv.server.name == "hiringmates-github-detector"
        assert srv.server.version == "1.0.0"

    def test_tool_functions_exist(self):
        assert callable(srv.detect_github_profile)
        assert callable(srv.get_ranking_weights)

    def test_instructions_describe_github_scope(self):
        text = srv.server.instructions or ""
        assert "GitHub" in text
        assert "1000" in text and "100" in text

    def test_linkedin_is_not_exposed(self):
        """LinkedIn was dropped from the agent surface."""
        assert not hasattr(srv, "detect_linkedin_profile")
        assert not hasattr(srv, "detect_handles")


class TestArgumentValidation:
    def test_requires_handle(self):
        assert srv.detect_github_profile("")["ok"] is False
        assert srv.detect_github_profile("   ")["ok"] is False

    def test_rejects_bad_loc_strategy(self):
        result = srv.detect_github_profile("octocat", loc_strategy="guesswork")
        assert result["ok"] is False
        assert result["allowed"] == ["tree", "languages", "clone"]

    def test_rejects_negative_top_n(self):
        result = srv.detect_github_profile("octocat", top_n=-1)
        assert result["ok"] is False
        assert "top_n" in result["error"]

    def test_valid_strategies_are_accepted_as_names(self):
        assert set(srv.VALID_LOC_STRATEGIES) == {"tree", "languages", "clone"}


class TestRankingWeightsTool:
    def test_weights_sum_to_one(self):
        result = srv.get_ranking_weights()
        assert abs(sum(result["weights"].values()) - 1.0) < 1e-9

    def test_documents_the_hard_filter(self):
        result = srv.get_ranking_weights()
        drop_if = result["hard_filter"]["drop_if"]
        assert "loc < 600" in drop_if
        assert "100" in drop_if

    def test_documents_the_confidence_rule(self):
        """The nominal threshold and the estimate-only floor are different."""
        hf = srv.get_ranking_weights()["hard_filter"]
        assert "1000" in hf["confidence_rule"]
        assert "600" in hf["confidence_rule"]
        assert "ambiguous" in hf["confidence_rule"].lower()

    def test_lists_all_components(self):
        result = srv.get_ranking_weights()
        assert set(result["components"]) == set(result["weights"])

    def test_documents_loc_estimate_accuracy(self):
        """Agents must be able to learn the LOC caveat without reading source."""
        acc = srv.get_ranking_weights()["loc_accuracy"]
        assert "clone" in acc["exact_when"]
        assert "tree" in acc["estimated_when"]
        assert "not uniform" in acc["error_margin"].lower()
        assert "damped" in acc["ranking_impact"].lower()
        assert "rank" in acc["guidance"].lower()

    def test_loc_component_marks_estimate_vs_exact(self):
        result = srv.get_ranking_weights()
        assert "EXACT" in result["components"]["loc"]
        assert "ESTIMATED" in result["components"]["loc"]


class TestMetaMerge:
    """
    The MCP layer must ADD to the engine's meta, never replace it.

    A previous version assigned a fresh dict, which silently dropped
    ``loc_accuracy`` and ``handle_note`` — the caveat and the handle rewrite
    never reached an agent, even though the skill documents both.
    """

    @staticmethod
    def _canned() -> dict:
        return {
            "ok": True,
            "handle": "someone",
            "errors": [],
            "meta": {
                "loc_strategy": "tree",
                "top_n_clone": 3,
                "generated_at": "2026-01-01T00:00:00+00:00",
                "authenticated": True,
                "handle_note": "parsed profile URL: 'https://github.com/x' -> 'x'",
                "loc_accuracy": {"estimated_count": 2, "exact_count": 1,
                                 "note": "..."},
            },
        }

    def test_engine_meta_survives_the_mcp_layer(self, monkeypatch):
        monkeypatch.setattr(srv, "detect_github", lambda *a, **k: self._canned())
        meta = srv.detect_github_profile("someone", top_n=3)["meta"]
        for key in ("loc_accuracy", "handle_note", "authenticated",
                    "top_n_clone", "loc_strategy", "generated_at"):
            assert key in meta, f"{key} was dropped by the MCP layer"

    def test_mcp_adds_its_own_fields(self, monkeypatch):
        monkeypatch.setattr(srv, "detect_github", lambda *a, **k: self._canned())
        meta = srv.detect_github_profile("someone", top_n=3)["meta"]
        assert meta["detector"] == "hiringmates-github-detector"
        assert meta["version"] == "1.0.0"
        assert meta["resolve_ambiguous"] is True
        assert meta["ranking_weights"]

    def test_no_divergent_top_n_key(self, monkeypatch):
        """`top_n_clone` is canonical; a second `top_n` would be ambiguous."""
        monkeypatch.setattr(srv, "detect_github", lambda *a, **k: self._canned())
        meta = srv.detect_github_profile("someone", top_n=3)["meta"]
        assert meta["top_n_clone"] == 3
        assert "top_n" not in meta

    def test_loc_accuracy_content_is_intact(self, monkeypatch):
        monkeypatch.setattr(srv, "detect_github", lambda *a, **k: self._canned())
        acc = srv.detect_github_profile("someone", top_n=3)["meta"]["loc_accuracy"]
        assert acc["estimated_count"] == 2 and acc["exact_count"] == 1


class TestStdoutGuard:
    def test_guard_redirects_stdout_to_stderr(self):
        real_stdout = sys.stdout
        with srv._stdout_guard():
            assert sys.stdout is sys.stderr
        assert sys.stdout is real_stdout

    def test_guard_restores_stdout_after_exception(self):
        real_stdout = sys.stdout
        with pytest.raises(RuntimeError):
            with srv._stdout_guard():
                raise RuntimeError("boom")
        assert sys.stdout is real_stdout

    def test_guard_keeps_protocol_stream_clean(self):
        """A stray print() inside a tool must not reach real stdout."""
        real_stdout = sys.stdout
        captured = io.StringIO()
        sys.stdout = captured
        try:
            with srv._stdout_guard():
                print("noise from legacy code")
        finally:
            sys.stdout = real_stdout
        assert captured.getvalue() == ""
