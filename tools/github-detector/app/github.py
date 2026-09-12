"""
GitHub intelligence module.

Takes a GitHub handle, collects profile + repository metadata, ranks the
repositories on transparent metrics, and shallow-clones the top N for deeper
analysis. Designed to be called by an AI agent and to return a single
JSON-serialisable dict.

Data sources
------------
- GitHub GraphQL v4 (primary) — one paginated query returns profile, every
  repository, its commit count, and its language breakdown. This avoids the
  N+1 REST pattern and the 60 req/hr anonymous ceiling.
- GitHub REST v3 — fallback for the recursive tree endpoint used by the
  LOC estimation strategies.
- ``git clone --depth 1`` — for exact LOC + structure on the shortlist.

Lines-of-code strategies (pluggable, see ``LocStrategy``)
---------------------------------------------------------
``tree``      **Default / chosen strategy (option B).** Estimate LOC from the
              recursive git-tree API using file byte sizes. Every repository
              can be ranked without downloading any of them; the top N are
              then shallow-cloned for exact LOC and structure. Best
              accuracy-per-byte trade-off.
``languages`` Cheapest (option C). Uses the /languages byte totals already
              fetched with the repository. Weakest signal: mixes in vendored
              and generated content and yields no file-level detail.
``clone``     Exact but expensive (option A). Clones *every* candidate before
              ranking, so bandwidth scales with the whole profile rather than
              the shortlist. Use only for small accounts.

Accuracy of the estimated LOC (important)
-----------------------------------------
``loc`` is **not an exact line count** for any repository whose
``loc_source`` is ``"tree"`` or ``"languages"``. It is a byte-size estimate:
the summed size of code files divided by ``DEFAULT_BYTES_PER_LINE``.

**The error is not uniform between repositories.** The constant is applied
uniformly *per byte*, but effective bytes-per-line is language-dependent, so
each repository carries its own error. Measured across 13 real repos:
**21.6 to 46.1** effective bytes/line (**2.14x** spread), giving per-repo
relative errors of **-40% to +32%**. Markup-heavy repositories sit at the low
end and are understated most; ``Spoon-Knife`` was estimated 18 against an exact
30 (-40%). Do NOT claim the bias "cancels out" — it does not.

These figures are the basis for ``LOC_ERROR_RATIO_LOW`` / ``_HIGH`` and must
stay consistent with them; ``test_note_percentages_match_the_constants`` fails
if they drift apart.

**Why the ranking is still near-accurate: damping, not cancellation.** The
LOC error is diluted rather than removed:

* ``loc`` carries only **0.20** of the score, against stars 0.30 and
  commits 0.25 — the two components that most drive ordering are unaffected
  by the estimate.
* LOC enters **log-scaled**, compressing a 30% error into a much smaller
  contribution.
* Scores are **min-max normalised within the profile**, so only the spread
  between repositories matters, not the absolute scale.

Net effect: ordering is reliable, absolute values are not. **Trust ``rank``
and ``score``; treat ``loc`` as an estimate** unless ``loc_source == "clone"``.
The top N are always cloned and carry exact counts, so the numbers quoted most
often are the precise ones.

Rate limits
-----------
Neither the tree API nor any other endpoint here is unlimited. Every REST
call — including the tree endpoint — draws from the same hourly bucket:
5,000 requests/hour authenticated, 60/hour anonymous. The ``tree`` strategy
costs **1 REST call per non-fork repository** plus 1 for the profile, so a
54-repository account consumed 45 REST calls (measured). Anonymous access
therefore manages roughly one such profile per hour; a token manages ~100.
GraphQL is metered separately and the commit-count pass is batched to ~1 call
per 25 repositories. ``GitHubClient.rate_limit()`` returns live remaining and
limit per bucket; consumption is reported in ``stats.rate_limit``.

Ranking is computed on a min-max normalised weighted sum so the weights are
directly interpretable, and log-scaling is applied before normalisation so a
single 10k-star repository does not flatten the rest of the distribution.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

import requests

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
GITHUB_GRAPHQL = "https://api.github.com/graphql"

# ---------------------------------------------------------------------------
# LOC counting policy — what counts as source code
# ---------------------------------------------------------------------------

# Extensions treated as hand-written source. Anything absent is not counted
# toward LOC (data, assets, config), which keeps fixtures and blobs from
# inflating the ranking.
#
# Web markup and styling are included deliberately: excluding them made
# static/frontend repositories report ~0 LOC, which wrongly dropped them via
# the hard filter. Note the trade-off: a repository that commits generated
# documentation HTML (sphinx builds, coverage reports) will count those lines
# too. Ignored build directories cover the common cases.
CODE_EXTENSIONS: frozenset[str] = frozenset({
    # systems / backend
    ".py", ".pyi", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".java", ".kt", ".kts",
    ".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh", ".cs", ".go", ".rs", ".rb",
    ".php", ".swift", ".m", ".mm", ".scala", ".clj", ".ex", ".exs", ".erl", ".hs",
    ".lua", ".pl", ".pm", ".r", ".jl", ".dart", ".sql", ".sh", ".bash", ".zsh",
    ".fish", ".ps1", ".groovy", ".sol", ".proto", ".tf", ".gradle",
    # web markup and styling
    ".html", ".htm", ".xhtml", ".css", ".scss", ".sass", ".less", ".styl",
    # component / template markup
    ".vue", ".svelte", ".astro", ".ejs", ".hbs", ".handlebars", ".pug", ".jade",
    ".twig", ".liquid", ".erb", ".jsp", ".cshtml", ".razor", ".njk", ".mustache",
})

# Directories never walked. Vendored trees and build output are not the
# author's work and would otherwise dominate the count.
IGNORE_DIRS: frozenset[str] = frozenset({
    ".git", ".hg", ".svn", "node_modules", "vendor", "third_party", "thirdparty",
    "dist", "build", "out", "target", "bin", "obj", ".venv", "venv", "env",
    "__pycache__", ".next", ".nuxt", ".cache", ".tox", ".mypy_cache", ".pytest_cache",
    ".ruff_cache", "coverage", "htmlcov", ".idea", ".vscode", "site-packages",
    "bower_components", "jspm_packages", "Pods", "Carthage", ".terraform",
})

# Generated artifacts that look like source but are machine-written.
GENERATED_EXACT: frozenset[str] = frozenset({
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "uv.lock",
    "Cargo.lock", "composer.lock", "Gemfile.lock", "go.sum", "packages.lock.json",
    "Pipfile.lock", "bun.lockb", "mix.lock", "pubspec.lock",
})

GENERATED_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\.min\.(js|css)$", re.I),
    re.compile(r"\.bundle\.(js|css)$", re.I),
    re.compile(r"\.map$", re.I),
    re.compile(r"_pb2(_grpc)?\.py$"),
    re.compile(r"\.pb\.(go|cc|h|java|py)$"),
    re.compile(r"\.designer\.cs$"),
    re.compile(r"\.g\.cs$"),
    re.compile(r"\.generated\.", re.I),
    re.compile(r"\.d\.ts$"),
)

# Bytes-per-line used to convert tree byte sizes into a LOC estimate.
#
# This makes `loc` an ESTIMATE, not an exact count. Calibrated at 38.6 mean
# effective bytes/line across a 12-repo sample, so 35 is reasonable ON AVERAGE,
# but the per-repo spread is 1.5x (31.5 -> 46.1) because true bytes/line is
# language-dependent. Per-repo relative error therefore runs about -10% to
# +32% — the bias does NOT cancel out between repositories, because the
# constant is uniform per byte, not per line.
#
# The ranking still holds up through DAMPING rather than cancellation: loc is
# only 0.20 of the score (vs stars 0.30, commits 0.25), it is log-scaled, and
# scores are min-max normalised within the profile. Trust `rank`/`score`;
# treat `loc` as an estimate unless loc_source == "clone".
DEFAULT_BYTES_PER_LINE = 35.0

# Surfaced to callers in `meta.loc_accuracy` so the caveat travels with the
# data instead of living only in documentation.
LOC_ESTIMATE_NOTE = (
    "`loc` is ESTIMATED for any repository whose loc_source is 'tree' or "
    "'languages': it is total code bytes divided by 35, not a counted line "
    "total. The error is NOT uniform between repositories — effective "
    "bytes-per-line is language-dependent (measured 21.6 to 46.1 across 13 "
    "repos, a 2.14x spread), so per-repo relative error ran -40% to +32%. "
    "Markup-heavy repos are understated worst (Spoon-Knife estimated 18 "
    "against an exact 30). The ranking is nonetheless near-accurate because "
    "the LOC error is DAMPED, not cancelled: loc carries only 0.20 of the "
    "score, it is log-scaled, scores are min-max normalised within the "
    "profile, and stars (0.30) plus commits (0.25) dominate the ordering. "
    "Trust `rank` and `score`; treat `loc` as an estimate unless loc_source "
    "is 'clone'."
)

# ---------------------------------------------------------------------------
# Ranking weights
# ---------------------------------------------------------------------------

DEFAULT_WEIGHTS: dict[str, float] = {
    "stars": 0.30,
    "commits": 0.25,
    "loc": 0.20,
    "recency": 0.15,
    "forks": 0.10,
}

# A repository is dropped when it is small AND not independently validated.
MIN_LOC = 1000
MIN_STARS_OVERRIDE = 100

# ---------------------------------------------------------------------------
# Measured error model for the byte-size LOC estimate
#
# `est = bytes / DEFAULT_BYTES_PER_LINE`, and the true count is
# `true = est / ratio`. Observed across real repositories, `ratio` spans roughly
# 0.60 (dense code, estimate understates) to 1.32 (markup-heavy, estimate
# overstates). So the honest interval for an estimate is
# `[est / 1.32, est / 0.60]` = `[0.76 * est, 1.67 * est]`.
#
# These bounds exist to stop the estimate from causing WRONG DECISIONS. A repo
# is only dropped on an estimate when even the worst-case understatement keeps
# it below the threshold; anything closer is resolved by cloning instead.
# ---------------------------------------------------------------------------
LOC_ERROR_RATIO_LOW = 0.60
LOC_ERROR_RATIO_HIGH = 1.32

# The estimate must fall below this to justify an estimate-only drop.
LOC_CONFIDENT_DROP_BELOW = int(MIN_LOC * LOC_ERROR_RATIO_LOW)   # 600


class GitHubError(Exception):
    """Raised for unrecoverable GitHub API problems (auth, not found)."""


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def resolve_token(explicit: Optional[str] = None) -> str:
    """
    Resolve a GitHub token, in priority order:
      1. explicit argument
      2. GITHUB_TOKEN / GH_TOKEN environment variable
      3. .env via app.config
      4. the `gh` CLI credential helper

    Returns "" when nothing is available; callers degrade to anonymous
    access (60 req/hr) rather than failing.
    """
    if explicit:
        return explicit.strip()

    for var in ("GITHUB_TOKEN", "GH_TOKEN"):
        val = os.getenv(var, "").strip()
        if val:
            return val

    try:
        from app.config import GITHUB_TOKEN as _cfg  # type: ignore
        if _cfg and _cfg.strip():
            return _cfg.strip()
    except Exception:
        pass

    # Last resort: reuse an existing gh CLI session on this machine.
    try:
        proc = subprocess.run(
            ["gh", "auth", "token"],
            capture_output=True, text=True, timeout=15,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return proc.stdout.strip()
    except Exception:
        pass

    return ""


# ---------------------------------------------------------------------------
# Handle normalisation
# ---------------------------------------------------------------------------

# A GitHub login: alphanumeric or hyphen, no leading/trailing hyphen, max 39.
_LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$")

_PROFILE_URL_RE = re.compile(
    r"^(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9-]+)(?:[/#?].*)?$",
    re.IGNORECASE,
)
_SSH_REMOTE_RE = re.compile(
    r"^(?:git@|ssh://git@)github\.com[:/]([A-Za-z0-9-]+)", re.IGNORECASE,
)
# Owners appearing in a URL that are not users.
_RESERVED_OWNERS = frozenset({
    "orgs", "organizations", "settings", "features", "about", "pricing",
    "explore", "topics", "collections", "trending", "sponsors", "marketplace",
    "login", "join", "search", "apps", "contact", "security", "enterprise",
})


def normalize_handle(raw: str) -> tuple[str, str]:
    """
    Reduce caller input to a bare GitHub username.

    Accepts a bare login, an ``@``-prefixed login, a profile URL, a repository
    URL, or an SSH remote, because an agent usually passes whatever form it
    happens to hold. Returns ``(handle, note)``, where *note* is empty when the
    input was already a bare login and otherwise describes the rewrite.
    """
    original = (raw or "").strip()
    if not original:
        return "", "empty handle"

    candidate = original
    note = ""

    m = _SSH_REMOTE_RE.match(candidate)
    if m:
        candidate = m.group(1)
        note = "parsed SSH remote as owner"
    else:
        m = _PROFILE_URL_RE.match(candidate)
        if m:
            candidate = m.group(1)
            note = "parsed profile URL"
        elif candidate.startswith("@"):
            candidate = candidate[1:]
            note = "stripped leading @"
        elif "/" in candidate:
            # Bare "owner/repo" form.
            candidate = candidate.split("/", 1)[0]
            note = "parsed owner from owner/repo"

    candidate = candidate.strip().rstrip("/")

    if candidate.lower() in _RESERVED_OWNERS:
        return "", (
            f"'{original}' resolves to a GitHub path, not a user account. "
            "Pass a username, e.g. 'octocat'."
        )
    if not _LOGIN_RE.match(candidate):
        return "", (
            f"'{original}' is not a valid GitHub username. Expected a bare "
            "login such as 'octocat' (letters, digits, hyphens; max 39 chars)."
        )

    if note and candidate != original:
        note = f"{note}: '{original}' -> '{candidate}'"
    elif candidate != original:
        note = f"normalised '{original}' -> '{candidate}'"
    return candidate, note


# ---------------------------------------------------------------------------
# Local LOC counting
# ---------------------------------------------------------------------------

def is_code_file(name: str) -> bool:
    """True when *name* is hand-written source we should count."""
    lower = name.lower()
    if lower in GENERATED_EXACT:
        return False
    if any(p.search(name) for p in GENERATED_PATTERNS):
        return False
    return Path(name).suffix.lower() in CODE_EXTENSIONS


def _looks_binary(path: Path, sniff: int = 8192) -> bool:
    try:
        with path.open("rb") as fh:
            return b"\x00" in fh.read(sniff)
    except OSError:
        return True


def count_loc_local(root: str | Path) -> dict[str, Any]:
    """
    Count non-blank source lines under *root*.

    Definition of LOC: non-blank lines in files whose extension is in
    ``CODE_EXTENSIONS``, excluding vendored/build directories and generated
    artifacts. Comment lines are counted (distinguishing them reliably
    requires per-language parsing); this is the standard "SLOC including
    comments" convention.

    This function produces **exact** counts and applies the convention
    identically to every repository, so exact counts are comparable between
    repos. That guarantee covers this function only — it does NOT extend to the
    byte-size estimates from ``loc_from_entries``, whose per-repo error is
    language-dependent. See ``LOC_ESTIMATE_NOTE``.
    """
    root = Path(root)
    total = 0
    files = 0
    per_language: dict[str, int] = {}

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        for fname in filenames:
            if not is_code_file(fname):
                continue
            fpath = Path(dirpath) / fname
            if _looks_binary(fpath):
                continue
            try:
                with fpath.open("r", encoding="utf-8", errors="ignore") as fh:
                    n = sum(1 for line in fh if line.strip())
            except OSError:
                continue
            if not n:
                continue
            total += n
            files += 1
            ext = fpath.suffix.lower()
            per_language[ext] = per_language.get(ext, 0) + n

    return {"loc": total, "files_counted": files, "loc_by_extension": per_language}


# ---------------------------------------------------------------------------
# Structure inference from the recursive tree listing
#
# Everything below is derived from the git-tree API, which returns the complete
# file listing without cloning. That makes it both reliable (no depth guessing)
# and free for every repository, not just the cloned shortlist. Anything that
# genuinely requires file *contents* is deliberately NOT attempted here — the
# calling agent can read the clone itself.
# ---------------------------------------------------------------------------

_CI_MARKERS: tuple[str, ...] = (
    ".github/workflows/", ".gitlab-ci.yml", ".travis.yml", "jenkinsfile",
    ".circleci/config.yml", "azure-pipelines.yml", "bitbucket-pipelines.yml",
    ".drone.yml", "cloudbuild.yaml", ".woodpecker.yml", "appveyor.yml",
)

_TEST_DIR_NAMES: frozenset[str] = frozenset({
    "test", "tests", "spec", "specs", "__tests__", "testing", "e2e", "integration-tests",
})

_LICENSE_PREFIXES: tuple[str, ...] = ("license", "licence", "copying", "unlicense", "notice")


def _basename(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def is_docker_artifact(path: str) -> bool:
    """
    True for Dockerfiles and compose files at ANY depth.

    Covers all three naming conventions seen in the wild: ``Dockerfile``,
    ``Dockerfile.dev``, and the suffix form ``python3.11.dockerfile``.
    """
    n = _basename(path).lower()
    return (
        n == "dockerfile"
        or n.startswith("dockerfile.")
        or n.endswith(".dockerfile")
        or n in {"docker-compose.yml", "docker-compose.yaml",
                 "compose.yml", "compose.yaml", "compose.yaml"}
    )


def loc_from_entries(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Estimate LOC by summing the byte size of code blobs in a tree listing."""
    total_bytes = 0
    files = 0
    for entry in entries:
        if entry.get("type") != "blob":
            continue
        if not is_code_file(entry.get("path", "")):
            continue
        total_bytes += int(entry.get("size", 0) or 0)
        files += 1
    return {
        "loc": int(total_bytes / DEFAULT_BYTES_PER_LINE),
        "bytes": total_bytes,
        "files_counted": files,
        "source": "tree",
    }


def loc_interval(estimate: int) -> list[int]:
    """
    Honest interval for an estimated LOC, from the measured error model.

    Returns ``[low, high]`` such that the true count is expected to fall inside.
    Empty for a non-positive estimate. Not applicable to exact counts.
    """
    if estimate <= 0:
        return [0, 0]
    return [int(estimate / LOC_ERROR_RATIO_HIGH), int(estimate / LOC_ERROR_RATIO_LOW)]


def infer_structure(entries: list[dict[str, Any]], truncated: bool = False) -> dict[str, Any]:
    """
    Derive structural signals from the recursive tree listing.

    All fields are inferable without cloning, so they are populated for every
    repository rather than only the cloned shortlist.
    """
    blobs = [e for e in entries if e.get("type") == "blob"]
    paths = [e.get("path", "") for e in blobs]

    top_level: list[dict[str, Any]] = []
    dir_file_counts: dict[str, int] = {}
    for entry in entries:
        p = entry.get("path", "")
        if "/" not in p:
            top_level.append({"name": p, "type": entry.get("type", "blob")})
        elif entry.get("type") == "blob":
            head = p.split("/", 1)[0]
            dir_file_counts[head] = dir_file_counts.get(head, 0) + 1

    largest = sorted(
        ({"path": p, "bytes": int(e.get("size", 0) or 0)}
         for p, e in zip(paths, blobs) if is_code_file(p)),
        key=lambda f: f["bytes"], reverse=True,
    )[:15]

    lower_paths = [p.lower() for p in paths]
    segments = {seg for p in lower_paths for seg in p.split("/")[:-1]}

    has_tests = bool(segments & _TEST_DIR_NAMES) or any(
        _basename(p).startswith(("test_", "test-", "spec_"))
        or _basename(p).endswith(("_test.py", "_test.go", ".test.js", ".test.ts",
                                  ".spec.js", ".spec.ts", "_spec.rb"))
        for p in lower_paths
    )

    return {
        "total_files": len(blobs),
        "top_level": top_level[:40],
        "dir_file_counts": dict(sorted(dir_file_counts.items(),
                                       key=lambda kv: kv[1], reverse=True)[:20]),
        "largest_source_files": largest,
        "has_tests": has_tests,
        "has_ci": any(m in p for p in lower_paths for m in _CI_MARKERS),
        "has_dockerfile": any(is_docker_artifact(p) for p in paths),
        "has_license": any(
            "/" not in p and _basename(p).lower().startswith(_LICENSE_PREFIXES)
            for p in lower_paths
        ),
        "has_readme": any(_basename(p).lower().startswith("readme") and "/" not in p
                          for p in lower_paths),
        "entry_point_hint": _pick_entry_point(largest),
        "tree_truncated": truncated,
    }


# Conventional entry-point filenames (lowercase), most specific first.
ENTRY_POINT_NAMES: frozenset[str] = frozenset({
    "main.py", "app.py", "server.py", "manage.py", "cli.py", "__main__.py",
    "wsgi.py", "asgi.py", "index.js", "index.ts", "index.jsx", "index.tsx",
    "server.js", "server.ts", "app.js", "main.go", "main.rs", "main.c",
    "main.cpp", "program.cs", "main.java", "main.kt", "main.dart", "main.rb",
})


def _pick_entry_point(largest: list[dict[str, Any]]) -> str:
    """
    Guess the entry point from the largest source files.

    Prefers conventional entry-point filenames and then the shallowest path, so
    a root-level ``main.py`` wins over a nested test fixture that happens to
    share the name.
    """
    candidates = [f for f in largest
                  if Path(f["path"]).name.lower() in ENTRY_POINT_NAMES]
    if not candidates:
        return ""
    candidates.sort(key=lambda f: (f["path"].count("/"), -f["bytes"]))
    return candidates[0]["path"]


# ---------------------------------------------------------------------------
# GitHub client
# ---------------------------------------------------------------------------

@dataclass
class RepoRecord:
    """One repository with every metric needed for ranking and reporting."""
    name: str = ""
    full_name: str = ""
    description: str = ""
    url: str = ""
    homepage: str = ""
    topics: list[str] = field(default_factory=list)

    primary_language: str = ""
    languages: dict[str, int] = field(default_factory=dict)  # name -> bytes

    stars: int = 0
    forks: int = 0
    open_issues: int = 0
    watchers: int = 0

    commit_count: int = 0
    loc: int = 0
    loc_source: str = ""          # tree | languages | clone
    files_counted: int = 0

    size_kb: int = 0
    created_at: str = ""
    pushed_at: str = ""
    default_branch: str = ""

    is_fork: bool = False
    is_archived: bool = False
    is_private: bool = False
    has_readme: bool = False
    readme_excerpt: str = ""

    score: float = 0.0
    rank: int = 0
    kept: bool = True
    drop_reason: str = ""
    cloned: bool = False
    local_path: str = ""
    structure: dict[str, Any] = field(default_factory=dict)

    # Honest reporting of the estimate's uncertainty.
    #   loc_range  : [low, high] implied by the measured error model, empty for
    #                exact counts.
    #   loc_uncertain : the estimate sits close enough to the filter threshold
    #                that the estimate alone cannot settle the decision.
    #   loc_measured : False when the file listing could not be fetched at all,
    #                so `loc` is UNKNOWN rather than zero. Such a repo is never
    #                dropped and is reported in stats.repos_unmeasured.
    #   loc_truncated : the listing was capped by GitHub, so `loc` is a LOWER
    #                bound and the true count may exceed it.
    loc_range: list[int] = field(default_factory=list)
    loc_uncertain: bool = False
    loc_resolved_by: str = ""     # "" | "clone" | "estimate" | "unavailable"
    loc_measured: bool = True
    loc_truncated: bool = False
    loc_error: str = ""           # why measurement failed, when it did


class GitHubClient:
    """Minimal, dependency-light GitHub API client with token-optional auth."""

    def __init__(self, token: str = "", timeout: float = 30.0):
        self.token = resolve_token(token)
        self.timeout = timeout
        self.anonymous = not self.token
        self._session = requests.Session()
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "hiringmates-github-detector",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        self._session.headers.update(headers)

    # -- low level -----------------------------------------------------

    def rate_limit(self) -> dict[str, Any]:
        try:
            r = self._session.get(f"{GITHUB_API}/rate_limit", timeout=self.timeout)
            if r.status_code == 200:
                return r.json().get("resources", {})
        except Exception as e:
            logger.debug("rate_limit probe failed: %s", e)
        return {}

    def rest_get(self, path: str, params: Optional[dict] = None) -> Any:
        url = path if path.startswith("http") else f"{GITHUB_API}{path}"
        r = self._session.get(url, params=params, timeout=self.timeout)
        if r.status_code == 404:
            raise GitHubError(f"Not found: {path}")
        if r.status_code in (403, 429):
            remaining = r.headers.get("X-RateLimit-Remaining")
            if remaining == "0":
                reset = r.headers.get("X-RateLimit-Reset", "?")
                raise GitHubError(
                    f"GitHub rate limit exhausted (reset epoch {reset}). "
                    "Set GITHUB_TOKEN for 5000 req/hr."
                )
            raise GitHubError(f"GitHub denied request ({r.status_code}): {r.text[:200]}")
        r.raise_for_status()
        return r.json()

    def graphql(self, query: str, variables: dict) -> dict:
        r = self._session.post(
            GITHUB_GRAPHQL,
            json={"query": query, "variables": variables},
            timeout=self.timeout,
        )
        if r.status_code == 401:
            raise GitHubError("GitHub token rejected (401). Check GITHUB_TOKEN.")
        r.raise_for_status()
        payload = r.json()
        if payload.get("errors"):
            msgs = "; ".join(e.get("message", "") for e in payload["errors"])
            raise GitHubError(f"GraphQL error: {msgs}")
        return payload.get("data", {})

    # -- profile + repos ----------------------------------------------

    # Only the repositories block is queried here. Profile fields come from the
    # REST /users endpoint, which returns the public email without requiring
    # the `user:email` OAuth scope that GraphQL's `email` field demands.
    _REPO_QUERY = """
    query($login: String!, $cursor: String) {
      user(login: $login) {
        login
        repositories(first: 100, after: $cursor, ownerAffiliations: OWNER,
                     orderBy: {field: PUSHED_AT, direction: DESC}) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            name description url homepageUrl
            stargazerCount forkCount isFork isArchived isPrivate diskUsage
            createdAt pushedAt
            primaryLanguage { name }
            defaultBranchRef { name }
            repositoryTopics(first: 20) { nodes { topic { name } } }
            issues(states: OPEN) { totalCount }
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges { size node { name } }
            }
            object(expression: "HEAD:") { ... on Tree { entries { name type } } }
          }
        }
      }
    }
    """

    def fetch_commit_counts(
        self,
        login: str,
        repos: Iterable[RepoRecord],
        batch_size: int = 25,
    ) -> None:
        """
        Populate ``commit_count`` in place using aliased GraphQL batching.

        ``history.totalCount`` on the default branch is the authoritative
        commit count. Batching ~25 repositories per request keeps a
        300-repository profile to ~12 calls instead of 300, which matters for
        both latency and the hourly rate limit.
        """
        targets = [r for r in repos if not r.is_fork and r.default_branch]
        for start in range(0, len(targets), batch_size):
            chunk = targets[start:start + batch_size]
            variables: dict[str, Any] = {"owner": login}
            var_decls: list[str] = ["$owner: String!"]
            fields: list[str] = []
            for idx, repo in enumerate(chunk):
                variables[f"n{idx}"] = repo.name
                var_decls.append(f"$n{idx}: String!")
                fields.append(
                    f"r{idx}: repository(owner: $owner, name: $n{idx}) "
                    "{ defaultBranchRef { target { ... on Commit "
                    "{ history { totalCount } } } } }"
                )
            query = (
                "query(" + ", ".join(var_decls) + ") { " + " ".join(fields) + " }"
            )
            try:
                data = self.graphql(query, variables)
            except GitHubError as e:
                logger.warning("commit batch failed (%d repos): %s", len(chunk), e)
                continue
            except Exception as e:
                logger.warning("commit batch error: %s", e)
                continue

            for idx, repo in enumerate(chunk):
                node = data.get(f"r{idx}") or {}
                ref = node.get("defaultBranchRef") or {}
                target = ref.get("target") or {}
                repo.commit_count = (target.get("history") or {}).get("totalCount", 0) or 0
            time.sleep(0.05)

    def fetch_profile(self, login: str) -> dict[str, Any]:
        """Public profile fields via REST (works for users and orgs)."""
        raw = self.rest_get(f"/users/{login}")
        return {
            "login": raw.get("login", ""),
            "name": raw.get("name") or "",
            "bio": raw.get("bio") or "",
            "company": raw.get("company") or "",
            "location": raw.get("location") or "",
            "blog": raw.get("blog") or "",
            "email": raw.get("email") or "",
            "twitter_username": raw.get("twitter_username") or "",
            "account_type": raw.get("type", "User"),
            "public_repos": raw.get("public_repos", 0),
            "public_gists": raw.get("public_gists", 0),
            "followers": raw.get("followers", 0),
            "following": raw.get("following", 0),
            "created_at": raw.get("created_at", ""),
            "updated_at": raw.get("updated_at", ""),
            "hireable": raw.get("hireable"),
            "avatar_url": raw.get("avatar_url", ""),
            "profile_url": raw.get("html_url", f"https://github.com/{login}"),
        }

    def fetch_repos(self, login: str, max_repos: int = 300) -> list[RepoRecord]:
        """
        Fetch every owned (non-fork) repository with metrics in one paginated
        GraphQL pass. Commit counts are resolved separately in batches.
        """
        records: list[RepoRecord] = []
        cursor: Optional[str] = None

        while True:
            try:
                data = self.graphql(self._REPO_QUERY,
                                    {"login": login, "cursor": cursor})
            except GitHubError as e:
                msg = str(e)
                if "Could not resolve to a User" in msg:
                    raise GitHubError(
                        f"'{login}' is not a GitHub user account. This tool "
                        "profiles individual users; organisation accounts are "
                        "not supported."
                    ) from e
                raise
            user = data.get("user")
            if not user:
                raise GitHubError(f"GitHub user not found: {login}")
            block = user["repositories"]
            for node in block["nodes"]:
                langs = {
                    e["node"]["name"]: e["size"]
                    for e in (node.get("languages") or {}).get("edges", [])
                }
                entries = ((node.get("object") or {}).get("entries") or [])
                records.append(RepoRecord(
                    name=node["name"],
                    full_name=f"{login}/{node['name']}",
                    description=node.get("description") or "",
                    url=node.get("url") or "",
                    homepage=node.get("homepageUrl") or "",
                    topics=[t["topic"]["name"]
                            for t in ((node.get("repositoryTopics") or {}).get("nodes") or [])],
                    primary_language=(node.get("primaryLanguage") or {}).get("name") or "",
                    languages=langs,
                    stars=node.get("stargazerCount", 0) or 0,
                    forks=node.get("forkCount", 0) or 0,
                    open_issues=((node.get("issues") or {}).get("totalCount", 0)) or 0,
                    size_kb=node.get("diskUsage", 0) or 0,
                    created_at=node.get("createdAt", "") or "",
                    pushed_at=node.get("pushedAt", "") or "",
                    default_branch=((node.get("defaultBranchRef") or {}).get("name")) or "",
                    is_fork=bool(node.get("isFork")),
                    is_archived=bool(node.get("isArchived")),
                    is_private=bool(node.get("isPrivate")),
                    has_readme=any(e.get("name", "").lower().startswith("readme")
                                   for e in entries),
                ))
            if len(records) >= max_repos:
                break
            if not block["pageInfo"]["hasNextPage"]:
                break
            cursor = block["pageInfo"]["endCursor"]
            time.sleep(0.1)

        return records[:max_repos]

    def fetch_readme_excerpt(self, full_name: str, limit: int = 600) -> str:
        """First *limit* characters of the rendered README text."""
        try:
            data = self.rest_get(f"/repos/{full_name}/readme")
            import base64
            content = base64.b64decode(data.get("content", "")).decode("utf-8", "ignore")
            content = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", content)   # strip images
            content = re.sub(r"\s+", " ", content).strip()
            return content[:limit]
        except Exception:
            return ""

    # -- LOC strategies ------------------------------------------------

    def fetch_tree(self, repo: RepoRecord) -> tuple[list[dict[str, Any]], bool]:
        """
        Fetch the complete recursive file listing for *repo*'s default branch.

        Returns ``(entries, truncated)``. One REST call, no clone. This single
        response backs both the LOC estimate and the structural fingerprint.
        GitHub caps the response on very large trees, in which case
        ``truncated`` is True and the results are a lower bound.

        **Raises ``GitHubError`` when the listing cannot be retrieved** (rate
        limit, network, 5xx). It deliberately does NOT return an empty listing:
        "could not measure" and "measured zero" are different facts, and
        collapsing them let a transient failure masquerade as an empty
        repository and silently drop it from the report.
        """
        branch = repo.default_branch or "HEAD"
        try:
            data = self.rest_get(
                f"/repos/{repo.full_name}/git/trees/{branch}",
                params={"recursive": "1"},
            )
        except GitHubError:
            raise
        except Exception as e:
            raise GitHubError(
                f"could not fetch file listing for {repo.full_name}: "
                f"{type(e).__name__}: {e}"
            ) from e
        return list(data.get("tree", []) or []), bool(data.get("truncated"))

    def loc_from_tree(self, repo: RepoRecord) -> dict[str, Any]:
        """Estimate LOC from the recursive git-tree API (no clone required)."""
        entries, truncated = self.fetch_tree(repo)
        info = loc_from_entries(entries)
        info["truncated"] = truncated
        return info

    def loc_from_languages(self, repo: RepoRecord) -> dict[str, Any]:
        """
        Cheapest strategy: use the /languages byte totals already fetched.
        Mixes non-source content and gives no file-level detail.
        """
        total_bytes = sum(repo.languages.values())
        return {
            "loc": int(total_bytes / DEFAULT_BYTES_PER_LINE),
            "bytes": total_bytes,
            "files_counted": 0,
            "truncated": False,
            "source": "languages",
        }

    # -- cloning -------------------------------------------------------

    def clone_repo(
        self,
        repo: RepoRecord,
        dest_root: str | Path,
        depth: int = 1,
    ) -> bool:
        """
        Shallow-clone *repo* into ``dest_root/<name>``.

        Returns True on success. ``depth=1`` keeps bandwidth proportional to
        the working tree only, which is all the structure and LOC passes need.
        """
        dest_root = Path(dest_root)
        dest_root.mkdir(parents=True, exist_ok=True)
        target = dest_root / repo.name
        if target.exists():
            repo.local_path = str(target)
            repo.cloned = True
            return True

        url = f"https://github.com/{repo.full_name}.git"
        env = dict(os.environ)
        if self.token:
            # Keep the token out of the remote URL and out of any error text.
            env["GIT_ASKPASS"] = "echo"
            env["GIT_TERMINAL_PROMPT"] = "0"
        cmd = ["git", "clone", "--depth", str(depth), "--single-branch", "--quiet", url, str(target)]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True,
                                  timeout=600, env=env)
            if proc.returncode != 0:
                logger.warning("clone failed for %s: %s",
                               repo.full_name, (proc.stderr or "")[:200])
                return False
        except Exception as e:
            logger.warning("clone error for %s: %s", repo.full_name, e)
            return False

        repo.cloned = True
        repo.local_path = str(target)
        return True


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------

def _recency_factor(pushed_at: str, now: Optional[datetime] = None) -> float:
    """1.0 for just-pushed, decaying with a ~180 day half-life."""
    if not pushed_at:
        return 0.0
    try:
        ts = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    now = now or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - ts).total_seconds() / 86400.0)
    return 0.5 ** (age_days / 180.0)


def _minmax(values: list[float]) -> list[float]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-12:
        return [1.0 if hi > 0 else 0.0 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


def rank_repos(
    repos: list[RepoRecord],
    weights: Optional[dict[str, float]] = None,
    include_forks: bool = False,
) -> list[RepoRecord]:
    """
    Score and order repositories in place, then apply the hard filters.

    Score = weighted sum of min-max normalised, log-scaled components, scaled
    to 0..100. Log-scaling is applied to the count metrics so that one
    outlier repository does not collapse the rest of the distribution into a
    flat band.
    """
    w = dict(DEFAULT_WEIGHTS)
    if weights:
        w.update(weights)

    candidates = [r for r in repos if include_forks or not r.is_fork]
    if not candidates:
        return []

    stars = _minmax([math.log1p(r.stars) for r in candidates])
    commits = _minmax([math.log1p(r.commit_count) for r in candidates])
    locs = _minmax([math.log1p(r.loc) for r in candidates])
    forks = _minmax([math.log1p(r.forks) for r in candidates])
    recency = [_recency_factor(r.pushed_at) for r in candidates]

    for i, r in enumerate(candidates):
        raw = (
            w["stars"] * stars[i]
            + w["commits"] * commits[i]
            + w["loc"] * locs[i]
            + w["recency"] * recency[i]
            + w["forks"] * forks[i]
        )
        r.score = round(raw * 100.0, 2)

    candidates.sort(key=lambda r: r.score, reverse=True)

    # Hard filter: tiny repos are dropped unless independently validated.
    #
    # An estimate is only trusted to *drop* a repo when even the worst-case
    # understatement still keeps it below the threshold. Repos whose estimate
    # sits closer than that are flagged `loc_uncertain` and kept, so real work
    # is never silently discarded on the strength of a byte count. The caller
    # settles them with an exact count (see `resolve_uncertain_repos`).
    for r in candidates:
        if r.is_archived:
            r.kept = False
            r.drop_reason = "archived"
            continue
        if r.stars > MIN_STARS_OVERRIDE:
            continue                       # independently validated, always kept
        if r.loc >= MIN_LOC:
            continue                       # comfortably above the threshold
        if not r.loc_measured:
            # The listing could not be fetched, so `loc` is UNKNOWN, not zero.
            # Missing data must never justify dropping a repository.
            r.loc_uncertain = True
            continue
        if r.loc_truncated:
            # GitHub capped the listing, so `loc` is a LOWER bound and the true
            # count may well clear the threshold.
            r.loc_uncertain = True
            continue
        if r.loc_source != "clone" and r.loc >= LOC_CONFIDENT_DROP_BELOW:
            r.loc_uncertain = True
            continue
        r.kept = False
        r.drop_reason = f"loc<{MIN_LOC} and stars<={MIN_STARS_OVERRIDE}"

    kept = [r for r in candidates if r.kept]
    for i, r in enumerate(kept, start=1):
        r.rank = i
    return kept


def resolve_uncertain_repos(repos: list[RepoRecord]) -> list[RepoRecord]:
    """
    Re-decide repos flagged ``loc_uncertain`` once better data is available.

    Called after any cloning attempt:

    * exact LOC clears the threshold -> kept, ``resolved_by="clone"``
    * exact LOC fails it             -> dropped, reason marked ``(exact)``
    * still unmeasured               -> KEPT, ``resolved_by="unavailable"``
    * measured but only estimated    -> kept, ``resolved_by="estimate"``

    Missing data is never grounds for a drop, so the unmeasured case always
    keeps the repository and says why.
    """
    changed: list[RepoRecord] = []
    for r in repos:
        if not r.loc_uncertain:
            continue
        r.loc_uncertain = False

        if r.loc_source == "clone":
            r.loc_resolved_by = "clone"
            if r.loc < MIN_LOC and r.stars <= MIN_STARS_OVERRIDE:
                r.kept = False
                r.drop_reason = f"loc<{MIN_LOC} and stars<={MIN_STARS_OVERRIDE} (exact)"
        elif not r.loc_measured:
            r.loc_resolved_by = "unavailable"
            r.kept = True
            r.drop_reason = ""
        else:
            r.loc_resolved_by = "estimate"
        changed.append(r)
    return changed


# ---------------------------------------------------------------------------
# Report assembly
# ---------------------------------------------------------------------------

@dataclass
class DetectorConfig:
    """Runtime knobs for one detection run."""
    loc_strategy: str = "tree"        # tree | languages | clone
    top_n_clone: int = 10
    max_repos: int = 300
    include_forks: bool = False
    fetch_commit_counts: bool = True
    fetch_readmes: bool = False
    # Clone repos whose LOC estimate is too close to the filter threshold to
    # decide on the estimate alone, so the verdict uses an exact count. Costs
    # roughly one extra clone per profile.
    resolve_ambiguous: bool = True
    # Cap on repos cloned purely to settle an uncertain LOC verdict. Without it,
    # a broad measurement failure (e.g. REST rate limit exhausting the tree
    # pass) would flag every repository and trigger a clone of all of them.
    max_resolve_clones: int = 10
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    clone_dir: str = "data/github_cache"
    clone_depth: int = 1
    keep_clones: bool = True


def detect_github(
    login: str,
    config: Optional[DetectorConfig] = None,
    token: str = "",
) -> dict[str, Any]:
    """
    Full GitHub pass for one handle.

    Returns a JSON-serialisable dict. Errors are reported inside
    ``errors`` rather than raised, so an agent always gets a usable payload.
    """
    cfg = config or DetectorConfig()
    started = time.time()

    # Accept a profile URL, @handle, or owner/repo as well as a bare login.
    raw_login = login
    login, handle_note = normalize_handle(raw_login)

    out: dict[str, Any] = {
        "handle": login,
        "handle_input": raw_login,
        "profile": {},
        "stats": {},
        "repositories": [],
        "cloned": [],
        "ambiguity_resolved": [],
        "warnings": [],
        "errors": [],
        "meta": {
            "loc_strategy": cfg.loc_strategy,
            "top_n_clone": cfg.top_n_clone,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    }
    if handle_note:
        out["meta"]["handle_note"] = handle_note

    def _done() -> dict[str, Any]:
        """
        Single exit point. Keeps ``ok`` consistent with ``errors`` so callers
        get the same top-level contract whether the run succeeded, failed, or
        returned early.
        """
        out["ok"] = not out["errors"]
        return out

    if not login:
        out["errors"].append(
            handle_note or f"could not resolve '{raw_login}' to a GitHub username"
        )
        return _done()

    try:
        client = GitHubClient(token)
    except Exception as e:
        out["errors"].append(f"client init failed: {e}")
        return _done()

    out["meta"]["authenticated"] = not client.anonymous

    # The /rate_limit endpoint does not consume quota, so this probe is free.
    rl_start = client.rate_limit()

    try:
        out["profile"] = client.fetch_profile(login)
    except GitHubError as e:
        out["errors"].append(str(e))
        return _done()
    except Exception as e:
        out["errors"].append(f"profile fetch failed: {e}")
        return _done()

    try:
        repos = client.fetch_repos(login, max_repos=cfg.max_repos)
    except GitHubError as e:
        out["errors"].append(str(e))
        return _done()
    except Exception as e:
        out["errors"].append(f"repo enumeration failed: {e}")
        return _done()

    if cfg.fetch_commit_counts:
        client.fetch_commit_counts(login, repos)

    clone_root = Path(cfg.clone_dir) / login
    unmeasured: list[RepoRecord] = []

    # ------------------------------------------------------------------
    # LOC pass — strategy chosen here, before any ranking decision.
    #
    #   tree      (B, default) estimate LOC from the repository file tree so
    #             every repo can be ranked without downloading any of them.
    #   languages (C) cheapest; byte totals already fetched with the repo.
    #   clone     (A) clone every candidate first for exact LOC, then rank.
    # ------------------------------------------------------------------
    if cfg.loc_strategy == "clone":
        # Option A: exact LOC requires the code, so clone every candidate.
        for repo in repos:
            if repo.is_fork and not cfg.include_forks:
                continue
            if client.clone_repo(repo, clone_root, depth=cfg.clone_depth):
                exact = count_loc_local(repo.local_path)
                repo.loc = exact["loc"]
                repo.loc_source = "clone"
                repo.files_counted = exact["files_counted"]
    elif cfg.loc_strategy == "languages":
        # Option C: cheapest. No tree listing, so no structural fingerprint.
        for repo in repos:
            if repo.is_fork:
                continue
            info = client.loc_from_languages(repo)
            repo.loc = info["loc"]
            repo.loc_source = info["source"]
            repo.files_counted = info["files_counted"]
            repo.loc_range = loc_interval(repo.loc)
    else:
        # Option B (default): one tree call per repository yields both the LOC
        # estimate and the full structural fingerprint, with no cloning.
        #
        # A failed fetch is recorded as UNMEASURED, never as zero. Zeroing it
        # made a transient rate-limit indistinguishable from an empty repo,
        # which then justified a confident drop — silent data loss.
        for repo in repos:
            if repo.is_fork:
                continue
            try:
                entries, truncated = client.fetch_tree(repo)
            except Exception as e:
                repo.loc_measured = False
                repo.loc_source = "unavailable"
                repo.loc = 0
                repo.loc_range = []
                repo.loc_error = str(e)
                unmeasured.append(repo)
                logger.warning("unmeasured repo %s: %s", repo.full_name, e)
                continue
            info = loc_from_entries(entries)
            repo.loc = info["loc"]
            repo.loc_source = info["source"]
            repo.files_counted = info["files_counted"]
            repo.loc_truncated = truncated
            repo.loc_range = loc_interval(repo.loc)
            repo.structure.update(infer_structure(entries, truncated))

    ranked = rank_repos(repos, weights=cfg.weights, include_forks=cfg.include_forks)

    # ------------------------------------------------------------------
    # Ambiguity resolution (options 1 + 2).
    #
    # rank_repos() kept and flagged any repo whose estimate sits too close to
    # the LOC threshold for the estimate alone to settle. Clone just those so
    # the verdict rests on an exact count. The band is narrow, so the measured
    # cost is about one extra clone per profile.
    # ------------------------------------------------------------------
    ambiguous = [r for r in ranked if r.loc_uncertain]
    to_resolve = ambiguous[: cfg.max_resolve_clones] if cfg.resolve_ambiguous else []
    deferred = ambiguous[len(to_resolve):]

    for repo in to_resolve:
        if not repo.cloned:
            if client.clone_repo(repo, clone_root, depth=cfg.clone_depth):
                exact = count_loc_local(repo.local_path)
                repo.loc = exact["loc"]
                repo.loc_source = "clone"
                repo.loc_measured = True
                repo.loc_truncated = False
                repo.files_counted = exact["files_counted"]
                repo.loc_range = []
        resolve_uncertain_repos([repo])

    # Anything past the cap is kept on whatever data we have — never dropped.
    resolve_uncertain_repos(deferred)

    if any(not r.kept for r in ambiguous):
        # Dropping a repo changes the surviving set, so renumber.
        ranked = [r for r in ranked if r.kept]
        for i, r in enumerate(ranked, start=1):
            r.rank = i

    out["ambiguity_resolved"] = [
        {"name": r.name, "loc": r.loc, "kept": r.kept,
         "resolved_by": r.loc_resolved_by, "drop_reason": r.drop_reason}
        for r in ambiguous
    ]

    # ------------------------------------------------------------------
    # Deep pass: shallow-clone the shortlist for exact LOC and to hand the
    # agent a working tree. Structure was already inferred from the tree
    # listing above, so it is available for every repository, not just these.
    # Repositories already cloned above or by the 'clone' strategy are reused.
    # ------------------------------------------------------------------
    for repo in ranked[: cfg.top_n_clone]:
        if not repo.cloned:
            if not client.clone_repo(repo, clone_root, depth=cfg.clone_depth):
                continue
            exact = count_loc_local(repo.local_path)
            repo.loc = exact["loc"] or repo.loc
            repo.loc_source = "clone"
            repo.files_counted = exact["files_counted"]
            repo.loc_range = []
        out["cloned"].append({
            "name": repo.name,
            "path": repo.local_path,
            "loc": repo.loc,
            "files_counted": repo.files_counted,
        })

    if cfg.fetch_readmes:
        for repo in ranked[: cfg.top_n_clone]:
            repo.readme_excerpt = client.fetch_readme_excerpt(repo.full_name)

    out["repositories"] = [asdict(r) for r in ranked]
    rl_end = client.rate_limit()

    # Degraded-but-usable conditions. These are WARNINGS, not errors: the report
    # is still valid, but some repositories could not be measured and were kept
    # rather than silently discarded.
    if unmeasured:
        out["warnings"].append(
            f"{len(unmeasured)} of {len(repos)} repositories could not be "
            "measured (file listing unavailable). Their loc is UNKNOWN, not "
            "zero, and they were KEPT rather than dropped. Retry, or set a "
            "GITHUB_TOKEN to raise the rate limit."
        )
    if deferred:
        out["warnings"].append(
            f"{len(deferred)} repositories needed an exact LOC verdict but "
            f"exceeded max_resolve_clones ({cfg.max_resolve_clones}); they were "
            "kept on the available data."
        )

    # Make the estimate/exact distinction explicit in the payload, so a calling
    # agent does not have to read source to know how much to trust `loc`.
    estimated = [r for r in ranked if r.loc_source in ("tree", "languages")]
    exact = [r for r in ranked if r.loc_source == "clone"]
    out["meta"]["loc_accuracy"] = {
        "estimated_count": len(estimated),
        "exact_count": len(exact),
        "bytes_per_line": DEFAULT_BYTES_PER_LINE,
        "interval_rule": (
            f"estimated loc carries the interval "
            f"[loc/{LOC_ERROR_RATIO_HIGH}, loc/{LOC_ERROR_RATIO_LOW}] "
            f"= [{1 / LOC_ERROR_RATIO_HIGH:.2f}x, {1 / LOC_ERROR_RATIO_LOW:.2f}x]"
        ),
        "note": LOC_ESTIMATE_NOTE,
    }

    def _bucket(snapshot: dict, name: str) -> dict[str, Any]:
        b = snapshot.get(name) or {}
        return {"remaining": b.get("remaining"), "limit": b.get("limit")}

    core_end = _bucket(rl_end, "core")
    core_start = _bucket(rl_start, "core")
    consumed = None
    if core_start["remaining"] is not None and core_end["remaining"] is not None:
        consumed = core_start["remaining"] - core_end["remaining"]

    out["stats"] = {
        "repos_total": len(repos),
        "repos_ranked": len(ranked),
        "repos_dropped": len(repos) - len(ranked),
        "repos_cloned": len(out["cloned"]),
        "repos_unmeasured": len(unmeasured),
        "repos_ambiguous": len(ambiguous),
        "repos_resolved_by_clone": sum(
            1 for r in ambiguous if r.loc_resolved_by == "clone"
        ),
        "repos_deferred_resolution": len(deferred),
        "total_loc_top_n": sum(r.loc for r in ranked[: cfg.top_n_clone]),
        "total_loc_all": sum(r.loc for r in ranked),
        "total_stars": sum(r.stars for r in ranked),
        "languages": _language_mix(ranked),
        "elapsed_seconds": round(time.time() - started, 2),
        "rate_limit": {
            "authenticated": not client.anonymous,
            "rest_consumed": consumed,
            "rest_remaining": core_end["remaining"],
            "rest_limit": core_end["limit"],
            "graphql_remaining": _bucket(rl_end, "graphql")["remaining"],
            "graphql_limit": _bucket(rl_end, "graphql")["limit"],
        },
    }
    return _done()


def _language_mix(repos: list[RepoRecord]) -> dict[str, int]:
    """Aggregate language bytes across repositories."""
    mix: dict[str, int] = {}
    for r in repos:
        for lang, size in r.languages.items():
            mix[lang] = mix.get(lang, 0) + size
    return dict(sorted(mix.items(), key=lambda kv: kv[1], reverse=True)[:15])


def cleanup_clones(clone_dir: str | Path) -> None:
    """Remove cached clones (used when keep_clones=False)."""
    p = Path(clone_dir)
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)
