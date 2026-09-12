"""
Tests for the GitHub handle-intelligence module.

Offline tests cover the deterministic logic (LOC counting policy, ranking,
hard filters). Live API tests are opt-in via GITHUB_DETECTOR_LIVE=1 so the default
suite stays hermetic.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest

from app.github import (
    LOC_CONFIDENT_DROP_BELOW,
    MIN_LOC,
    MIN_STARS_OVERRIDE,
    RepoRecord,
    _minmax,
    _recency_factor,
    count_loc_local,
    is_code_file,
    rank_repos,
)


# ---------------------------------------------------------------------------
# LOC counting policy
# ---------------------------------------------------------------------------

class TestCodeFilePolicy:
    def test_counts_real_source(self):
        for name in ("main.py", "app.tsx", "server.go", "lib.rs", "index.js"):
            assert is_code_file(name), name

    def test_rejects_lockfiles(self):
        for name in ("package-lock.json", "yarn.lock", "poetry.lock", "Cargo.lock"):
            assert not is_code_file(name), name

    def test_rejects_minified_and_generated(self):
        for name in ("bundle.min.js", "app.min.css", "style.css.map",
                     "schema_pb2.py", "service.pb.go", "api.generated.ts",
                     "types.d.ts"):
            assert not is_code_file(name), name

    def test_rejects_non_code(self):
        for name in ("README.md", "data.csv", "logo.png", "config.yaml"):
            assert not is_code_file(name), name


class TestCountLocLocal:
    def _write(self, root, rel, content):
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return p

    def test_counts_non_blank_lines(self, tmp_path):
        self._write(tmp_path, "main.py", "a = 1\n\n\nb = 2\n")
        result = count_loc_local(tmp_path)
        assert result["loc"] == 2
        assert result["files_counted"] == 1

    def test_ignores_vendored_dirs(self, tmp_path):
        self._write(tmp_path, "src/app.py", "x = 1\n")
        self._write(tmp_path, "node_modules/dep/index.js", "\n".join(
            f"var a{i} = {i};" for i in range(500)))
        self._write(tmp_path, ".venv/lib/thing.py", "\n".join(
            f"y{i} = {i}" for i in range(500)))
        result = count_loc_local(tmp_path)
        assert result["loc"] == 1, "vendored code must not be counted"

    def test_ignores_lockfiles(self, tmp_path):
        self._write(tmp_path, "main.py", "a = 1\n")
        self._write(tmp_path, "package-lock.json", "{\n" + "\n".join(
            f'"k{i}": {i},' for i in range(1000)) + "\n}")
        result = count_loc_local(tmp_path)
        assert result["loc"] == 1, "lockfiles must not inflate LOC"

    def test_skips_binary_files(self, tmp_path):
        self._write(tmp_path, "main.py", "a = 1\n")
        (tmp_path / "blob.py").write_bytes(b"\x00\x01\x02binary\x00")
        result = count_loc_local(tmp_path)
        assert result["loc"] == 1

    def test_empty_dir_is_zero(self, tmp_path):
        assert count_loc_local(tmp_path)["loc"] == 0


# ---------------------------------------------------------------------------
# Ranking helpers
# ---------------------------------------------------------------------------

class TestMinMax:
    def test_scales_to_unit_range(self):
        assert _minmax([0, 5, 10]) == [0.0, 0.5, 1.0]

    def test_constant_input_is_stable(self):
        assert _minmax([7, 7, 7]) == [1.0, 1.0, 1.0]

    def test_all_zero(self):
        assert _minmax([0, 0]) == [0.0, 0.0]

    def test_empty(self):
        assert _minmax([]) == []


class TestRecencyFactor:
    def test_fresh_repo_is_near_one(self):
        now = datetime.now(timezone.utc)
        assert _recency_factor(now.isoformat(), now=now) == pytest.approx(1.0)

    def test_half_life_is_180_days(self):
        now = datetime.now(timezone.utc)
        old = (now - timedelta(days=180)).isoformat()
        assert _recency_factor(old, now=now) == pytest.approx(0.5, abs=0.01)

    def test_empty_is_zero(self):
        assert _recency_factor("") == 0.0

    def test_malformed_is_zero(self):
        assert _recency_factor("not-a-date") == 0.0


# ---------------------------------------------------------------------------
# Ranking + hard filters
# ---------------------------------------------------------------------------

def _repo(name: str, **kw) -> RepoRecord:
    base = dict(name=name, full_name=f"user/{name}", loc=5000,
                commit_count=100, stars=10, forks=1,
                pushed_at=datetime.now(timezone.utc).isoformat())
    base.update(kw)
    return RepoRecord(**base)


class TestRanking:
    def test_higher_stars_ranks_first(self):
        a = _repo("small", stars=5)
        b = _repo("popular", stars=5000)
        ranked = rank_repos([a, b])
        assert ranked[0].name == "popular"

    def test_loc_contributes_to_score(self):
        a = _repo("tiny", loc=2000, stars=10)
        b = _repo("huge", loc=200_000, stars=10)
        ranked = rank_repos([a, b])
        assert ranked[0].name == "huge"

    def test_commit_count_contributes(self):
        a = _repo("few", commit_count=5)
        b = _repo("many", commit_count=5000)
        ranked = rank_repos([a, b])
        assert ranked[0].name == "many"

    def test_rank_numbers_are_sequential(self):
        repos = [_repo(f"r{i}", stars=i * 10) for i in range(5)]
        ranked = rank_repos(repos)
        assert [r.rank for r in ranked] == [1, 2, 3, 4, 5]

    def test_score_within_bounds(self):
        repos = [_repo(f"r{i}", stars=i) for i in range(10)]
        for r in rank_repos(repos):
            assert 0.0 <= r.score <= 100.0


class TestHardFilters:
    def test_drops_small_low_star_repo(self):
        """Well below the confidence floor AND <= 100 stars -> dropped."""
        repo = _repo("toy", loc=500, stars=10)
        assert rank_repos([repo]) == []

    def test_keeps_small_but_highly_starred_repo(self):
        """< 1k LOC but > 100 stars -> kept (the explicit override)."""
        repo = _repo("gem", loc=500, stars=MIN_STARS_OVERRIDE + 1)
        ranked = rank_repos([repo])
        assert len(ranked) == 1
        assert ranked[0].name == "gem"

    def test_near_threshold_repo_is_kept_and_flagged_uncertain(self):
        """
        An estimate close to the threshold cannot justify a drop, because the
        estimate's own error could put the true count above it. Such a repo is
        kept and flagged so the caller can settle it with an exact count.
        """
        repo = _repo("borderline", loc=MIN_LOC - 1, stars=MIN_STARS_OVERRIDE)
        ranked = rank_repos([repo])
        assert len(ranked) == 1, "must not be dropped on an estimate alone"
        assert ranked[0].loc_uncertain is True
        assert ranked[0].drop_reason == ""

    def test_boundary_stars_equal_100_below_floor_is_dropped(self):
        """'More than 100' means exactly 100 does not qualify."""
        repo = _repo("edge", loc=LOC_CONFIDENT_DROP_BELOW - 1,
                     stars=MIN_STARS_OVERRIDE)
        assert rank_repos([repo]) == []

    def test_exact_count_is_not_treated_as_uncertain(self):
        """A cloned repo has an exact LOC, so no flag is needed."""
        repo = _repo("exact", loc=MIN_LOC - 1, stars=MIN_STARS_OVERRIDE,
                     loc_source="clone")
        assert rank_repos([repo]) == []

    def test_boundary_loc_equal_1000_is_kept(self):
        """1000 LOC is not 'less than 1k', so it survives without stars."""
        repo = _repo("edge", loc=MIN_LOC, stars=0)
        assert len(rank_repos([repo])) == 1

    def test_drops_archived(self):
        repo = _repo("dead", loc=50_000, stars=900, is_archived=True)
        assert rank_repos([repo]) == []

    def test_drop_reason_recorded(self):
        repo = _repo("toy", loc=100, stars=1)
        rank_repos([repo])
        assert "loc<1000" in repo.drop_reason
        assert repo.kept is False

    def test_forks_excluded_by_default(self):
        fork = _repo("forked", stars=9000, is_fork=True)
        assert rank_repos([fork]) == []

    def test_forks_included_when_requested(self):
        fork = _repo("forked", stars=9000, is_fork=True)
        assert len(rank_repos([fork], include_forks=True)) == 1


class TestWeights:
    def test_custom_weights_shift_ranking(self):
        a = _repo("starred", stars=10_000, commit_count=1, loc=2000)
        b = _repo("committed", stars=1, commit_count=10_000, loc=2000)

        stars_heavy = rank_repos([a, b], weights={"stars": 1.0, "commits": 0.0,
                                                  "loc": 0.0, "recency": 0.0,
                                                  "forks": 0.0})
        assert stars_heavy[0].name == "starred"

        commits_heavy = rank_repos([a, b], weights={"stars": 0.0, "commits": 1.0,
                                                    "loc": 0.0, "recency": 0.0,
                                                    "forks": 0.0})
        assert commits_heavy[0].name == "committed"


class TestUnmeasuredRepos:
    """
    A failed measurement must never be treated as a zero measurement.

    Regression guard: ``fetch_tree()`` used to swallow every exception and
    return an empty listing, so ``loc`` became 0 — indistinguishable from a
    genuinely empty repo — and the filter then dropped it *silently*, with no
    error reported. A transient rate limit could therefore delete real
    repositories from the report.
    """

    def test_fetch_tree_raises_instead_of_returning_empty(self, monkeypatch):
        from app import github as gh

        client = gh.GitHubClient.__new__(gh.GitHubClient)

        def boom(path, params=None):
            raise gh.GitHubError("rate limited")

        monkeypatch.setattr(client, "rest_get", boom)
        repo = RepoRecord(name="x", full_name="u/x", default_branch="main")
        with pytest.raises(gh.GitHubError):
            client.fetch_tree(repo)

    def test_unmeasured_repo_is_not_dropped(self):
        """loc is UNKNOWN, not zero — missing data must not justify a drop."""
        repo = _repo("unmeasurable", loc=0, stars=5)
        repo.loc_measured = False
        repo.loc_source = "unavailable"
        ranked = rank_repos([repo])
        assert len(ranked) == 1, "must not be dropped on missing data"
        assert repo.kept is True

    def test_truncated_repo_is_not_dropped(self):
        """A truncated listing makes loc a LOWER bound, not an upper one."""
        repo = _repo("huge", loc=100, stars=5)
        repo.loc_truncated = True
        assert len(rank_repos([repo])) == 1

    def test_measured_zero_is_still_droppable(self):
        """A genuinely empty repo (measured, 0 LOC) remains droppable."""
        repo = _repo("empty", loc=0, stars=5)
        assert rank_repos([repo]) == []

    def test_resolve_keeps_unmeasured_and_says_why(self):
        from app.github import resolve_uncertain_repos
        repo = _repo("u", loc=0, stars=5)
        repo.loc_measured = False
        repo.loc_source = "unavailable"
        repo.loc_uncertain = True
        resolve_uncertain_repos([repo])
        assert repo.kept is True
        assert repo.loc_resolved_by == "unavailable"
        assert repo.drop_reason == ""

    def test_resolve_uses_exact_count_when_cloning_recovered(self):
        """If the clone path recovers the data, the exact verdict applies."""
        from app.github import resolve_uncertain_repos
        repo = _repo("recovered", loc=50, stars=5)
        repo.loc_source = "clone"
        repo.loc_measured = True
        repo.loc_uncertain = True
        resolve_uncertain_repos([repo])
        assert repo.kept is False
        assert repo.loc_resolved_by == "clone"
        assert "(exact)" in repo.drop_reason


class TestUnmeasuredEndToEnd:
    """Full pipeline with one repository's file listing failing."""

    @pytest.fixture
    def stubbed(self, monkeypatch):
        from app import github as gh

        repos = [
            RepoRecord(name="good", full_name="u/good", stars=5,
                       default_branch="main",
                       pushed_at=datetime.now(timezone.utc).isoformat()),
            RepoRecord(name="broken", full_name="u/broken", stars=5,
                       default_branch="main",
                       pushed_at=datetime.now(timezone.utc).isoformat()),
        ]
        monkeypatch.setattr(gh.GitHubClient, "rate_limit",
                            lambda self: {"core": {}, "graphql": {}})
        monkeypatch.setattr(gh.GitHubClient, "fetch_profile",
                            lambda self, login: {"login": login})
        monkeypatch.setattr(gh.GitHubClient, "fetch_repos",
                            lambda self, login, max_repos=300: list(repos))
        monkeypatch.setattr(gh.GitHubClient, "fetch_commit_counts",
                            lambda self, login, rs, batch_size=25: None)

        def flaky_tree(self, repo):
            if repo.name == "broken":
                raise gh.GitHubError("simulated rate limit")
            return ([{"type": "blob", "path": "main.py", "size": 70_000}], False)

        monkeypatch.setattr(gh.GitHubClient, "fetch_tree", flaky_tree)
        # Cloning fails too, so recovery is not possible in this scenario.
        monkeypatch.setattr(gh.GitHubClient, "clone_repo",
                            lambda self, repo, dest, depth=1: False)
        return gh

    def test_unmeasured_repo_survives_with_a_warning(self, stubbed):
        report = stubbed.detect_github(
            "someone", config=stubbed.DetectorConfig(top_n_clone=0))
        names = {r["name"] for r in report["repositories"]}
        assert "broken" in names, "unmeasured repo was silently dropped"
        assert report["stats"]["repos_unmeasured"] == 1
        assert report["errors"] == []
        assert report["warnings"], "an unmeasured repo must produce a warning"
        assert "UNKNOWN" in report["warnings"][0]

    def test_unmeasured_repo_is_flagged_in_the_payload(self, stubbed):
        report = stubbed.detect_github(
            "someone", config=stubbed.DetectorConfig(top_n_clone=0))
        broken = next(r for r in report["repositories"] if r["name"] == "broken")
        assert broken["loc_measured"] is False
        assert broken["loc_source"] == "unavailable"
        assert broken["loc_error"]
        assert broken["loc_resolved_by"] == "unavailable"

    def test_healthy_repo_is_unaffected(self, stubbed):
        report = stubbed.detect_github(
            "someone", config=stubbed.DetectorConfig(top_n_clone=0))
        good = next(r for r in report["repositories"] if r["name"] == "good")
        assert good["loc_measured"] is True
        assert good["loc_source"] == "tree"
        assert good["loc"] > 0


# ---------------------------------------------------------------------------
# Full contract, offline (the live class below is skipped by default)
# ---------------------------------------------------------------------------

class TestDetectGithubContract:
    """
    Exercises detect_github end to end with the network stubbed out.

    The live suite is skipped by default, so without this the whole orchestration
    path (LOC pass -> rank -> filter -> clone -> assemble) had no offline
    coverage, and a defect that made every call recurse went undetected.
    """

    @pytest.fixture
    def stubbed(self, monkeypatch):
        from app import github as gh

        repos = [
            RepoRecord(name="big", full_name="u/big", loc=0, stars=500,
                       forks=10, default_branch="main",
                       pushed_at=datetime.now(timezone.utc).isoformat(),
                       languages={"Python": 200_000}),
            RepoRecord(name="toy", full_name="u/toy", loc=0, stars=3,
                       forks=0, default_branch="main",
                       pushed_at=datetime.now(timezone.utc).isoformat(),
                       languages={"Python": 1_000}),
        ]

        monkeypatch.setattr(gh.GitHubClient, "rate_limit",
                            lambda self: {"core": {"remaining": 4990, "limit": 5000},
                                          "graphql": {"remaining": 5000, "limit": 5000}})
        monkeypatch.setattr(gh.GitHubClient, "fetch_profile",
                            lambda self, login: {"login": login, "name": "Test User",
                                                 "public_repos": 2, "followers": 5})
        monkeypatch.setattr(gh.GitHubClient, "fetch_repos",
                            lambda self, login, max_repos=300: list(repos))
        monkeypatch.setattr(gh.GitHubClient, "fetch_commit_counts",
                            lambda self, login, rs, batch_size=25: [
                                setattr(r, "commit_count", 100) for r in rs])
        def fake_tree(self, repo):
            if repo.name == "big":
                return ([{"type": "blob", "path": "main.py", "size": 175_000},
                         {"type": "blob", "path": "Dockerfile", "size": 500},
                         {"type": "blob", "path": "tests/test_x.py", "size": 400},
                         {"type": "tree", "path": "tests"}], False)
            return ([{"type": "blob", "path": "app.js", "size": 3_500}], False)

        monkeypatch.setattr(gh.GitHubClient, "fetch_tree", fake_tree)
        monkeypatch.setattr(gh.GitHubClient, "clone_repo",
                            lambda self, repo, dest, depth=1: True)
        return gh

    def test_top_level_contract(self, stubbed):
        report = stubbed.detect_github("someone", config=stubbed.DetectorConfig(top_n_clone=1))
        assert set(report) >= {"ok", "handle", "profile", "stats", "repositories",
                               "cloned", "errors", "meta"}
        assert report["ok"] is True
        assert report["errors"] == []

    def test_ok_is_consistent_with_errors_on_early_return(self, stubbed, monkeypatch):
        def boom(self, login):
            raise stubbed.GitHubError("Not found: /users/nobody")
        monkeypatch.setattr(stubbed.GitHubClient, "fetch_profile", boom)

        report = stubbed.detect_github("nobody")
        assert report["ok"] is False
        assert report["errors"]
        assert report["stats"] == {}

    def test_stats_contract(self, stubbed):
        report = stubbed.detect_github("someone", config=stubbed.DetectorConfig(top_n_clone=1))
        assert set(report["stats"]) >= {"repos_total", "repos_ranked", "repos_dropped",
                                        "repos_cloned", "total_loc_top_n", "total_loc_all",
                                        "total_stars", "languages", "elapsed_seconds",
                                        "rate_limit"}
        assert set(report["stats"]["rate_limit"]) >= {"authenticated", "rest_consumed",
                                                      "rest_remaining", "rest_limit"}

    def test_repo_record_contract(self, stubbed):
        report = stubbed.detect_github("someone", config=stubbed.DetectorConfig(top_n_clone=1))
        expected = {"rank", "name", "full_name", "description", "url", "topics",
                    "primary_language", "languages", "stars", "forks", "open_issues",
                    "commit_count", "loc", "loc_source", "files_counted", "created_at",
                    "pushed_at", "default_branch", "is_fork", "is_archived", "has_readme",
                    "score", "kept", "drop_reason", "cloned", "local_path", "structure"}
        for repo in report["repositories"]:
            assert set(repo) >= expected

    def test_filter_drops_the_small_repo(self, stubbed):
        report = stubbed.detect_github("someone", config=stubbed.DetectorConfig(top_n_clone=0))
        names = [r["name"] for r in report["repositories"]]
        assert "big" in names
        assert "toy" not in names, "100 LOC / 3 stars must be filtered out"

    def test_ranking_is_ordered(self, stubbed):
        report = stubbed.detect_github("someone", config=stubbed.DetectorConfig(top_n_clone=1))
        scores = [r["score"] for r in report["repositories"]]
        assert scores == sorted(scores, reverse=True)

    def test_top_n_zero_skips_cloning(self, stubbed):
        report = stubbed.detect_github("someone", config=stubbed.DetectorConfig(top_n_clone=0))
        assert report["cloned"] == []
        assert report["stats"]["repos_cloned"] == 0

    def test_loc_accuracy_caveat_is_reported(self, stubbed):
        """The estimate/exact distinction must travel with the payload."""
        report = stubbed.detect_github("someone", config=stubbed.DetectorConfig(top_n_clone=1))
        acc = report["meta"]["loc_accuracy"]
        assert acc["bytes_per_line"] == 35.0
        assert acc["estimated_count"] + acc["exact_count"] == len(report["repositories"])
        assert acc["exact_count"] >= 1, "the cloned repo should be counted as exact"

    def test_caveat_states_the_error_is_not_uniform(self, stubbed):
        """
        The error is language-dependent, so it does NOT cancel between repos.
        Guard against the earlier (incorrect) 'uniform scale factor' wording
        creeping back in.
        """
        note = stubbed.detect_github(
            "someone", config=stubbed.DetectorConfig(top_n_clone=1)
        )["meta"]["loc_accuracy"]["note"].lower()
        assert "not uniform" in note
        assert "damped" in note
        assert "rank" in note
        assert "uniform scale factor cancels" not in note

    def test_report_is_json_serialisable(self, stubbed):
        import json
        report = stubbed.detect_github("someone", config=stubbed.DetectorConfig(top_n_clone=1))
        assert json.dumps(report)


class TestEntryPointHeuristic:
    def test_prefers_root_level_over_nested(self):
        from app.github import _pick_entry_point
        files = [
            {"path": "tests/fixtures/main.py", "bytes": 9000},
            {"path": "main.py", "bytes": 100},
        ]
        assert _pick_entry_point(files) == "main.py"

    def test_returns_empty_when_no_conventional_name(self):
        from app.github import _pick_entry_point
        assert _pick_entry_point([{"path": "lib/util.py", "bytes": 10}]) == ""

    def test_picks_largest_among_same_depth(self):
        from app.github import _pick_entry_point
        files = [{"path": "app.py", "bytes": 10}, {"path": "main.py", "bytes": 500}]
        assert _pick_entry_point(files) == "main.py"


class TestStructureInference:
    """Structure is inferred from the tree listing, at any depth, no clone."""

    @staticmethod
    def _blobs(*paths: str, size: int = 100) -> list[dict]:
        return [{"type": "blob", "path": p, "size": size} for p in paths]

    def test_dockerfile_at_root(self):
        from app.github import infer_structure
        s = infer_structure(self._blobs("Dockerfile", "main.py"))
        assert s["has_dockerfile"] is True

    def test_dockerfile_deeply_nested(self):
        """Depth must not matter — this is what the clone-walk got wrong."""
        from app.github import infer_structure
        s = infer_structure(self._blobs("infra/docker/prod/Dockerfile", "main.py"))
        assert s["has_dockerfile"] is True

    def test_dockerfile_suffix_convention(self):
        from app.github import infer_structure
        s = infer_structure(self._blobs("docker-images/python3.11.dockerfile"))
        assert s["has_dockerfile"] is True

    def test_dockerfile_variant(self):
        from app.github import infer_structure
        assert infer_structure(self._blobs("Dockerfile.dev"))["has_dockerfile"] is True

    def test_compose_file_nested(self):
        from app.github import infer_structure
        s = infer_structure(self._blobs("deploy/compose.yaml"))
        assert s["has_dockerfile"] is True

    def test_no_docker_artifacts(self):
        from app.github import infer_structure
        assert infer_structure(self._blobs("main.py", "README.md"))["has_dockerfile"] is False

    def test_ci_detected(self):
        from app.github import infer_structure
        s = infer_structure(self._blobs(".github/workflows/ci.yml", "main.py"))
        assert s["has_ci"] is True

    def test_tests_detected_by_directory(self):
        from app.github import infer_structure
        s = infer_structure(self._blobs("tests/test_app.py", "app.py"))
        assert s["has_tests"] is True

    def test_tests_detected_by_filename(self):
        from app.github import infer_structure
        assert infer_structure(self._blobs("src/app_test.go"))["has_tests"] is True

    def test_license_detected(self):
        from app.github import infer_structure
        assert infer_structure(self._blobs("LICENSE", "main.py"))["has_license"] is True

    def test_counts_and_top_level(self):
        from app.github import infer_structure
        entries = self._blobs("main.py", "src/a.py", "src/b.py", "docs/c.md")
        # The real tree listing carries tree entries alongside blobs.
        entries += [{"type": "tree", "path": "src"}, {"type": "tree", "path": "docs"}]
        s = infer_structure(entries)
        assert s["total_files"] == 4
        assert s["dir_file_counts"]["src"] == 2
        assert {t["name"] for t in s["top_level"]} == {"main.py", "src", "docs"}

    def test_truncated_flag_propagates(self):
        from app.github import infer_structure
        assert infer_structure(self._blobs("a.py"), truncated=True)["tree_truncated"] is True

    def test_largest_source_files_excludes_non_code(self):
        from app.github import infer_structure
        entries = [{"type": "blob", "path": "big.png", "size": 900_000},
                   {"type": "blob", "path": "small.py", "size": 10}]
        s = infer_structure(entries)
        assert [f["path"] for f in s["largest_source_files"]] == ["small.py"]


class TestWebMarkupCounted:
    """HTML/CSS must count, or static sites report ~0 LOC and get dropped."""

    def test_html_css_are_code_files(self):
        from app.github import is_code_file
        for name in ("index.html", "about.htm", "styles.css", "app.scss",
                     "theme.less", "page.svelte", "view.vue", "index.astro",
                     "layout.ejs", "page.hbs"):
            assert is_code_file(name), name

    def test_loc_counts_a_static_site(self, tmp_path):
        from app.github import count_loc_local
        (tmp_path / "index.html").write_text("<html>\n<body>\nhi\n</body>\n</html>\n")
        (tmp_path / "styles.css").write_text("body {\n  margin: 0;\n}\n")
        result = count_loc_local(tmp_path)
        assert result["loc"] == 8, "5 html lines + 3 css lines"
        assert result["files_counted"] == 2

    def test_tree_estimate_counts_markup(self):
        from app.github import loc_from_entries
        entries = [{"type": "blob", "path": "index.html", "size": 3500},
                   {"type": "blob", "path": "styles.css", "size": 3500}]
        assert loc_from_entries(entries)["loc"] == 200

    def test_json_and_images_still_excluded(self):
        from app.github import is_code_file
        for name in ("package.json", "data.csv", "logo.png", "icon.svg"):
            assert not is_code_file(name), name


class TestLocNoteConsistency:
    """
    The caveat prose and the error constants must not drift apart.

    They did once: the note claimed a -10% worst case while
    ``LOC_ERROR_RATIO_LOW = 0.60`` encoded -40%, so the text agents actually
    read understated the risk by 4x.
    """

    def test_note_percentages_match_the_constants(self):
        from app.github import (
            LOC_ERROR_RATIO_HIGH,
            LOC_ERROR_RATIO_LOW,
            LOC_ESTIMATE_NOTE,
        )
        low = f"{(LOC_ERROR_RATIO_LOW - 1) * 100:.0f}%"     # -40%
        high = f"+{(LOC_ERROR_RATIO_HIGH - 1) * 100:.0f}%"   # +32%
        assert low in LOC_ESTIMATE_NOTE, f"{low} missing from the note"
        assert high in LOC_ESTIMATE_NOTE, f"{high} missing from the note"

    def test_note_does_not_contain_the_old_wrong_figures(self):
        from app.github import LOC_ESTIMATE_NOTE
        assert "-10% to +32%" not in LOC_ESTIMATE_NOTE
        assert "31.5 to 46.1" not in LOC_ESTIMATE_NOTE

    def test_note_interval_matches_the_ratio_constants(self):
        """The stated interval bounds must follow from the constants."""
        from app.github import LOC_ERROR_RATIO_HIGH, LOC_ERROR_RATIO_LOW, loc_interval
        low, high = loc_interval(1000)
        assert low == int(1000 / LOC_ERROR_RATIO_HIGH)
        assert high == int(1000 / LOC_ERROR_RATIO_LOW)


class TestTagExtraction:
    """Tags are derived from already-fetched data; no extra API calls."""

    @staticmethod
    def _repo(name: str, langs: dict, topics=(), **structure) -> RepoRecord:
        r = RepoRecord(name=name, full_name=f"u/{name}", stars=50, loc=5000,
                       languages=dict(langs))
        r.topics = list(topics)
        r.structure = dict(structure)
        return r

    def test_languages_ranked_by_bytes_with_share(self):
        from app.github import extract_languages
        repos = [self._repo("a", {"Python": 9000, "Shell": 1000})]
        langs = extract_languages(repos)
        assert [l["name"] for l in langs] == ["Python", "Shell"]
        assert langs[0]["share"] == 0.9
        assert langs[0]["repos"] == 1

    def test_language_repo_count_aggregates(self):
        from app.github import extract_languages
        repos = [self._repo("a", {"Python": 100}),
                 self._repo("b", {"Python": 100, "Go": 50})]
        by_name = {l["name"]: l for l in extract_languages(repos)}
        assert by_name["Python"]["repos"] == 2
        assert by_name["Go"]["repos"] == 1

    def test_low_share_language_stays_in_detail_but_not_tags(self):
        """Nothing is hidden; only noise is kept out of the flat tag list."""
        from app.github import build_tags
        repos = [self._repo("a", {"Python": 100_000, "Jinja": 50})]
        tags = build_tags(repos)
        assert "Python" in tags["all"]
        assert "Jinja" not in tags["all"]
        assert "Jinja" in [l["name"] for l in tags["languages"]]

    def test_skill_fires_on_structure_flag_ratio(self):
        from app.github import infer_skills
        repos = [self._repo("a", {"Python": 100}, has_ci=True),
                 self._repo("b", {"Python": 100}, has_ci=True),
                 self._repo("c", {"Python": 100}, has_ci=False)]
        names = [s["name"] for s in infer_skills(repos)]
        assert "ci-cd" in names

    def test_skill_fires_on_repeated_topic(self):
        from app.github import infer_skills
        repos = [self._repo("a", {"Python": 100}, topics=["docker"]),
                 self._repo("b", {"Python": 100}, topics=["docker"])]
        assert "containerisation" in [s["name"] for s in infer_skills(repos)]

    def test_single_topic_mention_does_not_fire(self):
        """Precision over recall: one mention is weak evidence."""
        from app.github import infer_skills
        repos = [self._repo("a", {"Python": 100}, topics=["docker"]),
                 self._repo("b", {"Python": 100})]
        assert "containerisation" not in [s["name"] for s in infer_skills(repos)]

    def test_confidence_high_when_signals_agree(self):
        from app.github import infer_skills
        repos = [self._repo("a", {"Python": 100}, topics=["docker"],
                            has_dockerfile=True),
                 self._repo("b", {"Python": 100}, topics=["docker"],
                            has_dockerfile=True)]
        skill = next(s for s in infer_skills(repos) if s["name"] == "containerisation")
        assert skill["confidence"] == "high"
        assert len(skill["evidence"]) >= 2

    def test_confidence_medium_on_single_signal(self):
        from app.github import infer_skills
        repos = [self._repo("a", {"Python": 100}, topics=["async"]),
                 self._repo("b", {"Python": 100}, topics=["async"])]
        skill = next(s for s in infer_skills(repos) if s["name"] == "async-programming")
        assert skill["confidence"] == "medium"

    def test_every_skill_carries_evidence(self):
        from app.github import infer_skills
        repos = [self._repo("a", {"Python": 100}, topics=["docker"], has_ci=True,
                            has_tests=True)]
        for skill in infer_skills(repos):
            assert skill["evidence"], f"{skill['name']} fired with no evidence"

    def test_flat_tag_list_combines_languages_and_skills(self):
        from app.github import build_tags
        repos = [self._repo("a", {"Python": 100}, topics=["docker"], has_ci=True),
                 self._repo("b", {"Python": 100}, topics=["docker"])]
        tags = build_tags(repos)
        assert "Python" in tags["all"]
        assert "containerisation" in tags["all"]

    def test_repeated_topic_on_one_repo_counts_once(self):
        """A topic listed twice on a single repo is still one repo's worth."""
        from app.github import infer_skills
        repos = [self._repo("a", {"Python": 100}, topics=["docker", "docker"])]
        assert "containerisation" not in [s["name"] for s in infer_skills(repos)]

    def test_no_repos_yields_empty_tags(self):
        from app.github import build_tags
        tags = build_tags([])
        assert tags["all"] == []
        assert tags["languages"] == []
        assert tags["skills"] == []


class TestProfilePersistence:
    def test_off_by_default(self, tmp_path, monkeypatch):
        from app import github as gh

        monkeypatch.setattr(gh.GitHubClient, "rate_limit",
                            lambda self: {"core": {}, "graphql": {}})
        monkeypatch.setattr(gh.GitHubClient, "fetch_profile",
                            lambda self, login: {"login": login})
        monkeypatch.setattr(gh.GitHubClient, "fetch_repos",
                            lambda self, login, max_repos=300: [])
        cfg = gh.DetectorConfig(top_n_clone=0, profile_dir=str(tmp_path / "profiles"))
        report = gh.detect_github("someone", config=cfg)
        assert "profile_saved_to" not in report["meta"]
        assert not (tmp_path / "profiles").exists()

    def test_saves_when_enabled(self, tmp_path, monkeypatch):
        import json
        from app import github as gh

        monkeypatch.setattr(gh.GitHubClient, "rate_limit",
                            lambda self: {"core": {}, "graphql": {}})
        monkeypatch.setattr(gh.GitHubClient, "fetch_profile",
                            lambda self, login: {"login": login})
        monkeypatch.setattr(gh.GitHubClient, "fetch_repos",
                            lambda self, login, max_repos=300: [])
        cfg = gh.DetectorConfig(top_n_clone=0, save_profile=True,
                                profile_dir=str(tmp_path / "profiles"))
        report = gh.detect_github("someone", config=cfg)
        written = tmp_path / "profiles" / "someone.json"
        assert written.exists()
        saved = json.loads(written.read_text(encoding="utf-8"))
        assert saved["handle"] == "someone"
        assert "tags" in saved
        assert report["meta"]["profile_saved_to"].endswith("someone.json")


class TestHandleNormalisation:
    """Agents pass URLs and @handles as often as bare logins."""

    def test_bare_login_unchanged(self):
        from app.github import normalize_handle
        handle, note = normalize_handle("octocat")
        assert handle == "octocat"
        assert note == ""

    def test_at_prefixed(self):
        from app.github import normalize_handle
        assert normalize_handle("@octocat")[0] == "octocat"

    def test_https_profile_url(self):
        from app.github import normalize_handle
        assert normalize_handle("https://github.com/octocat")[0] == "octocat"

    def test_url_with_trailing_slash(self):
        from app.github import normalize_handle
        assert normalize_handle("github.com/octocat/")[0] == "octocat"

    def test_repo_url_yields_owner(self):
        from app.github import normalize_handle
        assert normalize_handle("https://github.com/octocat/repo")[0] == "octocat"

    def test_ssh_remote(self):
        from app.github import normalize_handle
        assert normalize_handle("git@github.com:octocat/repo.git")[0] == "octocat"

    def test_owner_slash_repo(self):
        from app.github import normalize_handle
        assert normalize_handle("octocat/repo")[0] == "octocat"

    def test_note_explains_the_rewrite(self):
        from app.github import normalize_handle
        handle, note = normalize_handle("https://github.com/octocat")
        assert handle == "octocat"
        assert "octocat" in note and "github.com" in note

    def test_reserved_path_rejected_with_guidance(self):
        from app.github import normalize_handle
        handle, note = normalize_handle("https://github.com/orgs/foo")
        assert handle == ""
        assert "username" in note.lower()

    def test_garbage_rejected_with_guidance(self):
        from app.github import normalize_handle
        handle, note = normalize_handle("not a handle!!")
        assert handle == ""
        assert "valid github username" in note.lower()

    def test_empty_rejected(self):
        from app.github import normalize_handle
        assert normalize_handle("")[0] == ""

    def test_overlong_login_rejected(self):
        """GitHub logins cap at 39 characters."""
        from app.github import normalize_handle
        handle, note = normalize_handle("a" * 40)
        assert handle == ""
        assert "valid github username" in note.lower()

    def test_39_char_login_accepted(self):
        from app.github import normalize_handle
        assert normalize_handle("a" * 39)[0] == "a" * 39

    def test_overlong_handle_rejected_without_network(self, monkeypatch):
        """Reject locally rather than spending an API call on impossible input."""
        from app import github as gh

        def explode(self, *a, **k):
            raise AssertionError("must not reach the network")

        monkeypatch.setattr(gh.GitHubClient, "fetch_profile", explode)
        report = gh.detect_github("this-user-definitely-does-not-exist-xyz123")
        assert report["ok"] is False
        assert "valid github username" in report["errors"][0].lower()

    def test_detect_github_reports_normalisation(self, monkeypatch):
        """The rewrite must be visible in meta, not silent."""
        from app import github as gh

        monkeypatch.setattr(gh.GitHubClient, "rate_limit",
                            lambda self: {"core": {}, "graphql": {}})
        monkeypatch.setattr(gh.GitHubClient, "fetch_profile",
                            lambda self, login: {"login": login})
        monkeypatch.setattr(gh.GitHubClient, "fetch_repos",
                            lambda self, login, max_repos=300: [])
        report = gh.detect_github("https://github.com/octocat",
                                  config=gh.DetectorConfig(top_n_clone=0))
        assert report["handle"] == "octocat"
        assert report["handle_input"] == "https://github.com/octocat"
        assert "github.com" in report["meta"]["handle_note"]

    def test_detect_github_rejects_bad_handle_without_network(self, monkeypatch):
        from app import github as gh

        def explode(self, *a, **k):
            raise AssertionError("must not reach the network")

        monkeypatch.setattr(gh.GitHubClient, "fetch_profile", explode)
        report = gh.detect_github("not a handle!!")
        assert report["ok"] is False
        assert report["errors"]
        assert "valid github username" in report["errors"][0].lower()


# ---------------------------------------------------------------------------
# Live API tests (opt-in)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(os.getenv("GITHUB_DETECTOR_LIVE") != "1",
                    reason="set GITHUB_DETECTOR_LIVE=1 to run live GitHub tests")
class TestLiveGitHub:
    def test_detects_real_profile_without_cloning(self):
        from app.github import DetectorConfig, detect_github

        cfg = DetectorConfig(top_n_clone=0, max_repos=30)
        report = detect_github("octocat", config=cfg)
        assert report["errors"] == []
        assert report["profile"]["login"] == "octocat"
        assert report["stats"]["repos_total"] > 0
        for repo in report["repositories"]:
            assert repo["loc"] >= 0
            assert repo["rank"] >= 1

    def test_reports_rate_limit_consumption(self):
        from app.github import DetectorConfig, detect_github

        cfg = DetectorConfig(top_n_clone=0, max_repos=10)
        report = detect_github("octocat", config=cfg)
        rl = report["stats"]["rate_limit"]
        assert rl["rest_remaining"] is not None
        assert rl["rest_consumed"] is not None and rl["rest_consumed"] >= 0

    def test_nonexistent_user_returns_error_not_exception(self):
        """Valid-shaped but non-existent -> API 404 surfaced as an error."""
        from app.github import DetectorConfig, detect_github

        report = detect_github("zzz-no-such-user-xyz123",
                               config=DetectorConfig(top_n_clone=0, max_repos=5))
        assert report["errors"]
        assert "Not found" in report["errors"][0]

    def test_org_account_gives_actionable_error(self):
        """Organisations are out of scope; the message must say so."""
        from app.github import DetectorConfig, detect_github

        report = detect_github("python", config=DetectorConfig(top_n_clone=0,
                                                               max_repos=5))
        assert report["errors"]
        assert "organisation" in report["errors"][0].lower()
