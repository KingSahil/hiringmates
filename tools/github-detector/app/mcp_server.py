"""
HiringMates GitHub Detector — MCP server (stdio).

Exposes the GitHub handle detector as an MCP tool so an AI agent can call it
natively and receive structured JSON.

Run:
    python -m app.mcp_server

Tools
-----
detect_github_profile   Full GitHub pass for one handle (primary tool).
get_ranking_weights     Ranking weights + hard-filter thresholds.

Scope note
----------
This server is deliberately GitHub-only. The LinkedIn provider seam lives in
``app/linkedin_profile.py`` and is not exposed here; wire it back in only once
a licensed data route is chosen.

Protocol note
-------------
The stdio transport uses stdout exclusively for JSON-RPC framing. Several
existing modules in this project print directly to stdout (banner text, error
hints), which would corrupt the stream. Every tool body therefore runs inside
``_stdout_guard()``, which redirects stdout to stderr for the duration of the
call. Do not remove it.
"""

from __future__ import annotations

import contextlib
import logging
import sys
from typing import Any

# Logging must never touch stdout under the stdio transport.
logging.basicConfig(level=logging.INFO, stream=sys.stderr,
                    format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("hiringmates.mcp")

from mcp.server.mcpserver import MCPServer  # noqa: E402

from app.github import (  # noqa: E402
    DEFAULT_BYTES_PER_LINE,
    DEFAULT_WEIGHTS,
    LOC_CONFIDENT_DROP_BELOW,
    LOC_ESTIMATE_NOTE,
    MIN_LOC,
    MIN_STARS_OVERRIDE,
    DetectorConfig,
    detect_github,
)

VALID_LOC_STRATEGIES = ("tree", "languages", "clone")

server = MCPServer(
    name="hiringmates-github-detector",
    version="1.0.0",
    instructions=(
        "GitHub handle intelligence. Pass a GitHub username and receive "
        "structured JSON: the public profile, every owned repository ranked on "
        "stars, commit count, lines of code, recency and forks, plus the "
        "top-N repositories shallow-cloned with exact LOC and structure. "
        f"Repositories under {MIN_LOC} lines of code are dropped unless they "
        f"have more than {MIN_STARS_OVERRIDE} stars; archived repositories are "
        "always dropped. Set top_n=0 for a fast metadata-only pass when you do "
        "not need cloned code."
    ),
)


@contextlib.contextmanager
def _stdout_guard():
    """
    Redirect stdout to stderr for the duration of a tool call.

    Protects the stdio JSON-RPC stream from stray print() calls in the
    existing codebase.
    """
    original = sys.stdout
    sys.stdout = sys.stderr
    try:
        yield
    finally:
        sys.stdout = original


def _error(message: str, **extra: Any) -> dict[str, Any]:
    payload = {"ok": False, "error": message}
    payload.update(extra)
    return payload


@server.tool(
    name="detect_github_profile",
    description=(
        "Primary tool. Given a GitHub username (or profile URL), returns the "
        "public profile, every owned repository ranked on "
        "stars/commits/LOC/recency/forks, and the top-N repositories "
        "shallow-cloned with exact lines of code and a structural fingerprint "
        "(tests, CI, Dockerfile, license, entry point). Repositories under "
        "1000 LOC are dropped unless starred by more than 100 users; archived "
        "repositories are always dropped. Because `loc` is a byte-size "
        "ESTIMATE for non-cloned repos and its error varies by language, a "
        "repo is only dropped on an estimate when even the worst-case error "
        "keeps it below the threshold; anything closer is cloned so the "
        "verdict is exact (see stats.repos_ambiguous). Ranking stays reliable "
        "through damping, not cancellation. Call get_ranking_weights for full "
        "accuracy details. Use top_n=0 for a fast metadata-only pass. "
        "Returns JSON."
    ),
)
def detect_github_profile(
    handle: str,
    loc_strategy: str = "tree",
    top_n: int = 10,
    include_forks: bool = False,
    fetch_readmes: bool = False,
    max_repos: int = 300,
    resolve_ambiguous: bool = True,
    max_resolve_clones: int = 10,
) -> dict[str, Any]:
    """
    Parameters
    ----------
    handle : GitHub username, profile URL, @handle, or owner/repo. URLs and
        @-prefixed forms are normalised; the rewrite is reported in
        ``meta.handle_note``.
    loc_strategy : How lines of code are derived for the ranking pass.
        'tree' (default, recommended) estimates LOC from the repository file
        tree without cloning anything, then clones only the top N for exact
        numbers. 'languages' is cheapest and least accurate. 'clone' clones
        every repository first for exact LOC and is expensive.
    top_n : How many top-ranked repositories to shallow-clone and analyse in
        depth. 0 skips cloning entirely and returns metadata only.
    include_forks : Include forked repositories. Excluded by default because
        they are not the account holder's own work.
    fetch_readmes : Also fetch README excerpts for the cloned shortlist.
    max_repos : Upper bound on repositories enumerated.
    resolve_ambiguous : When true (default), repositories whose LOC estimate is
        too close to the 1000-LOC filter threshold for the estimate alone to
        decide are cloned so the verdict uses an exact count. Costs roughly one
        extra clone per profile. See ``stats.repos_ambiguous``.
    max_resolve_clones : Cap on repositories cloned purely to settle an LOC
        verdict. Without it, a broad API outage would flag every repo and
        trigger a clone of all of them. Repos past the cap are kept and
        reported in ``stats.repos_deferred_resolution``.

    Always inspect ``warnings``. A repository whose file listing could not be
    fetched has ``loc_measured: false`` and an UNKNOWN ``loc`` (not zero); it is
    kept rather than dropped, and counted in ``stats.repos_unmeasured``.
    """
    if not handle or not handle.strip():
        return _error("'handle' is required")
    if loc_strategy not in VALID_LOC_STRATEGIES:
        return _error(f"invalid loc_strategy '{loc_strategy}'",
                      allowed=list(VALID_LOC_STRATEGIES))
    if top_n < 0:
        return _error("'top_n' must be >= 0")

    with _stdout_guard():
        try:
            cfg = DetectorConfig(
                loc_strategy=loc_strategy,
                top_n_clone=int(top_n),
                max_repos=max(1, int(max_repos)),
                include_forks=bool(include_forks),
                fetch_readmes=bool(fetch_readmes),
                resolve_ambiguous=bool(resolve_ambiguous),
                max_resolve_clones=max(0, int(max_resolve_clones)),
            )
            report = detect_github(handle.strip(), config=cfg)
        except Exception as e:
            logger.exception("github pass failed")
            return {"ok": False, "handle": handle,
                    "errors": [f"{type(e).__name__}: {e}"]}

    # MERGE into the engine's meta rather than replacing it.
    #
    # detect_github() owns loc_accuracy, handle_note, authenticated,
    # loc_strategy, top_n_clone and generated_at. The MCP layer only adds
    # transport-level fields. An earlier version assigned a fresh dict here,
    # which silently dropped the LOC caveat and the handle rewrite before an
    # agent ever saw them — and the key sets diverged (top_n vs top_n_clone),
    # so a plain .update() would have left both present and ambiguous. The
    # canonical key is the engine's `top_n_clone`.
    report.setdefault("meta", {}).update({
        "detector": "hiringmates-github-detector",
        "version": "1.0.0",
        "ranking_weights": dict(DEFAULT_WEIGHTS),
        "resolve_ambiguous": bool(resolve_ambiguous),
    })
    return report


@server.tool(
    name="get_ranking_weights",
    description=(
        "Returns the default repository ranking weights and the hard filter "
        "thresholds, so a calling agent can explain or reproduce the ordering. "
        "Useful before deciding whether the default ranking suits the task."
    ),
)
def get_ranking_weights() -> dict[str, Any]:
    """Expose the ranking configuration for agent introspection."""
    return {
        "weights": dict(DEFAULT_WEIGHTS),
        "scale": "0-100, weighted sum of min-max normalised log-scaled components",
        "components": {
            "stars": "stargazerCount",
            "commits": "commit count on the default branch",
            "loc": "lines of code — EXACT when loc_source is 'clone', "
                   "ESTIMATED from file byte sizes when 'tree' or 'languages'",
            "recency": "exponential decay on pushedAt, 180 day half-life",
            "forks": "forkCount",
        },
        "loc_accuracy": {
            "exact_when": "loc_source == 'clone' (the top N repositories)",
            "estimated_when": "loc_source == 'tree' or 'languages'",
            "error_margin": "measured -10% to +32% per repo; NOT uniform",
            "bytes_per_line_assumed": DEFAULT_BYTES_PER_LINE,
            "bytes_per_line_measured": "38.6 mean, 31.5-46.1 range (1.5x spread)",
            "why_not_uniform": (
                "The constant is applied uniformly per BYTE, not per line. "
                "Effective bytes-per-line is language-dependent, so each "
                "repository carries its own error and the bias does not cancel."
            ),
            "ranking_impact": (
                "Damped, not cancelled. loc is only 0.20 of the score (stars "
                "0.30 and commits 0.25 dominate the ordering), it enters "
                "log-scaled, and scores are min-max normalised within the "
                "profile. Ordering stays reliable; absolute values do not."
            ),
            "guidance": (
                "Trust `rank` and `score` for ordering. Treat `loc` as an "
                "estimate unless loc_source is 'clone'."
            ),
            "note": LOC_ESTIMATE_NOTE,
        },
        "hard_filter": {
            "drop_if": (
                f"loc < {LOC_CONFIDENT_DROP_BELOW} AND stars <= "
                f"{MIN_STARS_OVERRIDE}  (estimate-only drop)"
            ),
            "note": (
                f"exactly {MIN_STARS_OVERRIDE} stars does not qualify "
                "('more than 100')"
            ),
            "confidence_rule": (
                f"The nominal threshold is {MIN_LOC} LOC, but an estimate only "
                f"justifies a drop below {LOC_CONFIDENT_DROP_BELOW} — the point "
                "at which even the worst-case estimate error still keeps the "
                "repo under the threshold. Repositories between "
                f"{LOC_CONFIDENT_DROP_BELOW} and {MIN_LOC} LOC with "
                f"<={MIN_STARS_OVERRIDE} stars are AMBIGUOUS: they are kept and "
                "flagged loc_uncertain, then cloned so the verdict is exact."
            ),
            "ambiguous_reporting": (
                "stats.repos_ambiguous counts them; the `ambiguity_resolved` "
                "array gives the exact LOC and final verdict for each."
            ),
            "always_dropped": "archived repositories",
            "forks": "excluded unless include_forks=true",
        },
    }


def main() -> None:
    logger.info("hiringmates github detector starting (stdio transport)")
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
