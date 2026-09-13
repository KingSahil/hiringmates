"""
Verbose Real-Time Human-Readable CLI for GitHub Candidate Detection.

Provides instant terminal output as each step (authentication, profile fetch,
repository enumeration, tree analysis, LOC measurement, cloning, and ranking)
executes in real-time, followed by a clean executive scorecard.

Usage:
    python tools/github-detector/scripts/detect_verbose.py <handle> [--top-n N] [--max-repos N] [--include-forks] [--json] [--output PATH]
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
import json
import os
from pathlib import Path
import sys
import time
from typing import Any

# Ensure stdout supports UTF-8 on all platforms
if sys.stdout.encoding != "utf-8" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Add parent directory to sys.path so app.github is importable
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT))

from app.github import (  # noqa: E402
    DetectorConfig,
    GitHubClient,
    GitHubError,
    normalize_handle,
    rank_repos,
    resolve_uncertain_repos,
    count_loc_local,
    loc_from_entries,
    loc_interval,
    infer_structure,
    build_tags,
)

# Terminal styling constants
C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_DIM = "\033[2m"
C_CYAN = "\033[96m"
C_GREEN = "\033[92m"
C_YELLOW = "\033[93m"
C_BLUE = "\033[94m"
C_MAGENTA = "\033[95m"
C_RED = "\033[91m"


def print_banner(handle: str) -> None:
    print(f"\n{C_BOLD}{C_CYAN}========================================================================{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}          HIRINGMATES - GITHUB CANDIDATE PROFILER (REALTIME)            {C_RESET}")
    print(f"{C_BOLD}{C_CYAN}========================================================================{C_RESET}")
    print(f"  Candidate Handle : {C_BOLD}{C_YELLOW}@{handle}{C_RESET}")
    print(f"  Session Started  : {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{C_CYAN}------------------------------------------------------------------------{C_RESET}\n")


def log_phase(step_num: int, total_steps: int, title: str) -> None:
    print(f"\n{C_BOLD}{C_BLUE}[PHASE {step_num}/{total_steps}]{C_RESET} {C_BOLD}{title}{C_RESET}")


def log_item(text: str) -> None:
    print(f"   {C_DIM}->{C_RESET} {text}")


def log_ok(text: str) -> None:
    print(f"   {C_BOLD}{C_GREEN}[OK]{C_RESET} {text}")


def log_warn(text: str) -> None:
    print(f"   {C_BOLD}{C_YELLOW}[NOTE]{C_RESET} {text}")


def log_err(text: str) -> None:
    print(f"   {C_BOLD}{C_RED}[FAIL]{C_RESET} {text}")


def make_bar(percentage: float, width: int = 20) -> str:
    filled = int(round((percentage / 100.0) * width))
    filled = max(0, min(width, filled))
    return "=" * filled + " " * (width - filled)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Human-readable real-time CLI for GitHub candidate detector"
    )
    parser.add_argument("handle", help="GitHub username, profile URL, or @handle")
    parser.add_argument("--top-n", type=int, default=0, help="Number of top repos to clone for exact file analysis (default: 0)")
    parser.add_argument("--max-repos", type=int, default=300, help="Maximum repos to analyze (default: 300)")
    parser.add_argument("--include-forks", action="store_true", help="Include forked repos")
    parser.add_argument("--json", action="store_true", help="Print raw machine JSON at the end")
    parser.add_argument("--output", type=str, default="", help="Save full JSON report to file")

    args = parser.parse_args(argv)
    started = time.time()

    print_banner(args.handle)

    # 1. Identity & Auth Check
    log_phase(1, 5, "Resolving GitHub Account & Connection")
    raw_login, handle_note = normalize_handle(args.handle)
    login = raw_login.lower()
    if not login:
        log_err(f"Could not parse a valid GitHub username from '{args.handle}'")
        return 1
    log_ok(f"Target GitHub handle resolved: {C_BOLD}@{login}{C_RESET}")

    token = os.getenv("GITHUB_TOKEN", "").strip() or None
    try:
        client = GitHubClient(token)
    except Exception as e:
        log_err(f"Failed to connect to GitHub API: {e}")
        return 1

    rl_start = client.rate_limit()
    core_start = (rl_start.get("core") or {})
    remaining = core_start.get("remaining", "N/A")
    limit = core_start.get("limit", "N/A")

    if not client.anonymous:
        log_ok(f"GitHub Auth: Personal Access Token Active (Rate limit: {remaining}/{limit} calls remaining)")
    else:
        log_warn(f"GitHub Auth: Public Anonymous Mode (Rate limit: {remaining}/{limit} calls remaining)")

    # 2. Fetch User Profile
    log_phase(2, 5, "Retrieving Developer Profile Information")
    try:
        t0 = time.time()
        profile = client.fetch_profile(login)
        elapsed = time.time() - t0
        log_ok(f"Found GitHub user '{profile.get('name') or login}' ({elapsed:.2f}s)")
        log_item(f"Name      : {profile.get('name') or login}")
        log_item(f"Bio       : {profile.get('bio') or 'No public bio provided'}")
        log_item(f"Company   : {profile.get('company') or 'None specified'}")
        log_item(f"Location  : {profile.get('location') or 'Not listed'}")
        log_item(f"Community : {profile.get('followers', 0):,} followers  |  Following {profile.get('following', 0):,} developers")
    except GitHubError as e:
        log_err(f"GitHub profile lookup error: {e}")
        return 1
    except Exception as e:
        log_err(f"Unexpected error: {e}")
        return 1

    # 3. Scanning Repositories
    log_phase(3, 5, f"Scanning Public Repositories (Scanning up to {args.max_repos})")
    try:
        t0 = time.time()
        repos = client.fetch_repos(login, max_repos=args.max_repos)
        elapsed = time.time() - t0
        log_ok(f"Discovered {len(repos)} public repositories ({elapsed:.2f}s)")
    except Exception as e:
        log_err(f"Failed to list repositories: {e}")
        return 1

    if not repos:
        log_warn(f"Developer @{login} has no public repositories.")
        return 0

    # Ingest commit counts
    try:
        t0 = time.time()
        client.fetch_commit_counts(login, repos)
        total_commits = sum(r.commit_count for r in repos)
        log_ok(f"Cataloged {total_commits:,} authored commits across repositories")
    except Exception as e:
        log_warn(f"Commit telemetry notice: {e}")

    # 4. Deep Tree & Code Inspection
    log_phase(4, 5, "Inspecting Codebases & Measuring Lines of Code (LOC)")
    t0 = time.time()
    unmeasured = []

    for idx, repo in enumerate(repos, start=1):
        if repo.is_fork and not args.include_forks:
            continue

        try:
            entries, truncated = client.fetch_tree(repo)
            info = loc_from_entries(entries)
            repo.loc = info["loc"]
            repo.loc_source = info["source"]
            repo.files_counted = info["files_counted"]
            repo.loc_truncated = truncated
            repo.loc_range = loc_interval(repo.loc)
            repo.structure.update(infer_structure(entries, truncated))

            star_badge = f"{repo.stars}* " if repo.stars else ""
            lang_badge = f"[{repo.primary_language}]" if repo.primary_language else "[Docs]"
            loc_label = f"{repo.loc:,} LOC" if repo.loc else "<100 LOC"
            print(f"   [{idx:>2}/{len(repos)}] {repo.name:<26} {C_YELLOW}{star_badge:<8}{C_RESET} {C_CYAN}{lang_badge:<14}{C_RESET} -> {C_GREEN}{loc_label:<12}{C_RESET} ({repo.files_counted} source files)")
        except Exception as e:
            repo.loc_measured = False
            repo.loc_source = "unavailable"
            repo.loc = 0
            repo.loc_range = []
            repo.loc_error = str(e)
            unmeasured.append(repo)
            log_warn(f"[{idx:>2}/{len(repos)}] {repo.name:<26} -> tree listing unavailable ({e})")

    # Ranking
    cfg = DetectorConfig(
        top_n_clone=args.top_n,
        max_repos=args.max_repos,
        include_forks=args.include_forks,
        save_profile=False,
    )
    ranked = rank_repos(repos, weights=cfg.weights, include_forks=cfg.include_forks)

    # Resolve ambiguous near cutoff if necessary
    clone_root = Path(cfg.clone_dir) / login
    ambiguous = [r for r in ranked if r.loc_uncertain]
    to_resolve = ambiguous[: cfg.max_resolve_clones] if cfg.resolve_ambiguous else []
    deferred = ambiguous[len(to_resolve):]

    if to_resolve:
        for r in to_resolve:
            if client.clone_repo(r, clone_root, depth=cfg.clone_depth):
                exact = count_loc_local(r.local_path)
                r.loc = exact["loc"]
                r.loc_source = "clone"
                r.loc_measured = True
                r.files_counted = exact["files_counted"]
                r.loc_range = []
        resolve_uncertain_repos(to_resolve)
        resolve_uncertain_repos(deferred)
        if any(not r.kept for r in ambiguous):
            ranked = [r for r in ranked if r.kept]
            for i, r in enumerate(ranked, start=1):
                r.rank = i

    # Optional deep cloning of top-N repos
    cloned_records = []
    if cfg.top_n_clone > 0:
        log_phase(5, 5, f"Deep Inspection: Cloning Top {min(cfg.top_n_clone, len(ranked))} Ranked Repositories")
        for repo in ranked[: cfg.top_n_clone]:
            if not repo.cloned:
                log_item(f"Cloning #{repo.rank} '{repo.full_name}'...")
                if client.clone_repo(repo, clone_root, depth=cfg.clone_depth):
                    exact = count_loc_local(repo.local_path)
                    repo.loc = exact["loc"] or repo.loc
                    repo.loc_source = "clone"
                    repo.files_counted = exact["files_counted"]
                    log_ok(f"Exact line count for '{repo.name}': {repo.loc:,} LOC")
            cloned_records.append({
                "name": repo.name,
                "path": repo.local_path,
                "loc": repo.loc,
                "files_counted": repo.files_counted,
            })
    else:
        log_phase(5, 5, "Synthesizing Competencies & Profile Scorecard")

    tags_data = build_tags(ranked)
    total_elapsed = time.time() - started
    total_loc = sum(r.loc for r in ranked)
    total_stars = sum(r.stars for r in ranked)

    # ------------------------------------------------------------------
    # HUMAN-READABLE EXECUTIVE SCORECARD
    # ------------------------------------------------------------------
    print(f"\n{C_BOLD}{C_CYAN}========================================================================{C_RESET}")
    print(f"{C_BOLD}{C_CYAN}                   DEVELOPER CANDIDATE SCORECARD                        {C_RESET}")
    print(f"{C_BOLD}{C_CYAN}========================================================================{C_RESET}")

    print(f"\n{C_BOLD}1. CANDIDATE PROFILE:{C_RESET}")
    print(f"   Name         : {profile.get('name') or login}")
    print(f"   GitHub       : @{login} (https://github.com/{login})")
    print(f"   Bio          : {profile.get('bio') or 'None specified'}")
    print(f"   Location     : {profile.get('location') or 'Not specified'}")
    print(f"   Organization : {profile.get('company') or 'None'}")
    print(f"   Total Repos  : {len(repos)} public projects found ({len(ranked)} active/kept)")
    print(f"   Star Traction: {total_stars:,} stars across all repositories")
    print(f"   Total Volume : ~{total_loc:,} estimated lines of source code")

    # Languages Section
    languages = tags_data.get("languages", [])
    if languages:
        print(f"\n{C_BOLD}2. PRIMARY TECH STACK & LANGUAGE MIX:{C_RESET}")
        for lang in languages[:8]:
            share = lang.get("share", 0) * 100
            bar = make_bar(share, width=20)
            bytes_kb = lang.get("bytes", 0) / 1024.0
            bytes_str = f"{bytes_kb:,.1f} KB" if bytes_kb >= 1 else f"{lang.get('bytes', 0)} B"
            print(f"   {lang.get('name', 'Unknown'):<14} [{C_CYAN}{bar}{C_RESET}] {share:>5.1f}%  ({bytes_str:<10} in {lang.get('repos', 0)} repos)")

    # Skills Section
    skills = tags_data.get("skills", [])
    if skills:
        print(f"\n{C_BOLD}3. IDENTIFIED COMPETENCIES & CONCRETE EVIDENCE:{C_RESET}")
        for sk in skills:
            conf = sk.get("confidence", "medium")
            badge = f"{C_GREEN}[HIGH CONFIDENCE]{C_RESET}" if conf == "high" else f"{C_YELLOW}[MEDIUM CONFIDENCE]{C_RESET}"
            print(f"   {badge} {C_BOLD}{sk.get('name').title()}{C_RESET}")
            for ev in sk.get("evidence", []):
                print(f"      * {ev}")

    # Top Projects Section
    print(f"\n{C_BOLD}4. TOP FEATURED REPOSITORIES (RANKED BY IMPACT):{C_RESET}")
    for idx, r in enumerate(ranked[:6], start=1):
        score_badge = f"Impact Score: {r.score:.1f}/100" if r.score is not None else ""
        lang_str = r.primary_language or "General"
        loc_str = f"~{r.loc:,} lines" if r.loc else "<100 lines"
        stars_str = f"{r.stars:,} stars"
        commits_str = f"{r.commit_count} commits"

        print(f"   {C_BOLD}#{idx} {r.name}{C_RESET} ({r.url})")
        print(f"      Language: {lang_str:<12} | {stars_str:<12} | {commits_str:<12} | {loc_str}")
        if r.description:
            desc_snip = r.description if len(r.description) <= 80 else r.description[:77] + "..."
            print(f"      Description: {C_DIM}{desc_snip}{C_RESET}")
        print(f"      {C_YELLOW}{score_badge}{C_RESET}")
        print()

    # Telemetry Summary
    rl_end = client.rate_limit()
    core_end = (rl_end.get("core") or {}).get("remaining", "N/A")
    print(f"{C_CYAN}------------------------------------------------------------------------{C_RESET}")
    print(f"  Analysis completed in {C_BOLD}{total_elapsed:.2f}s{C_RESET} | Remaining GitHub API calls: {core_end}")
    print(f"{C_CYAN}========================================================================{C_RESET}\n")

    # Build report dict for export
    report = {
        "ok": True,
        "handle": login,
        "profile": profile,
        "repositories": [asdict(r) for r in ranked],
        "tags": tags_data,
        "cloned": cloned_records,
        "stats": {
            "repos_total": len(repos),
            "repos_ranked": len(ranked),
            "total_loc": total_loc,
            "total_stars": total_stars,
            "elapsed_seconds": round(total_elapsed, 2),
        },
    }

    if args.output:
        out_path = Path(args.output).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        log_ok(f"Report JSON written to: {out_path}")

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False, default=str))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
