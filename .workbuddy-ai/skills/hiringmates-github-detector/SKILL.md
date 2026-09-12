---
name: hiringmates-github-detector
description: How to call the HiringMates GitHub Detector MCP tool. Takes a GitHub username and returns a ranked repository intelligence report. Use when you need to profile a GitHub account, rank someone's repositories by importance, or analyse their codebase structure.
version: 1.0.0
author: agent
agent_created: true
license: MIT
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [mcp, github, hiringmates, repo-ranking, loc, tool-calling]
    category: tooling
    requires_toolsets: [terminal]
---

# HiringMates GitHub Detector (MCP)

A local MCP server that profiles one GitHub account and returns a ranked
repository report. **You call it as a tool; you never call the GitHub API
directly.**

Source of truth: `tools/github-detector/app/mcp_server.py` (server),
`tools/github-detector/app/github.py` (engine).

## When to use

- "Profile the GitHub user `<handle>`", "what does this dev work on?"
- "Rank this person's repositories by importance"
- "How much code has `<handle>` written? What languages?"
- Deciding which of someone's repos are worth reading in depth
- Evaluating a candidate's engineering footprint from their GitHub

## Connecting (stdio transport)

Add to your MCP client config. **`cwd` must be the tool root**
(`tools/github-detector`) — the server imports from the `app` package and
resolves its clone cache relative to that directory.

```json
{
  "mcpServers": {
    "github-detector": {
      "command": "<repo>/tools/github-detector/.venv/Scripts/python.exe",
      "args": ["-m", "app.mcp_server"],
      "cwd": "<repo>/tools/github-detector",
      "env": { "GITHUB_TOKEN": "<optional, strongly recommended>" }
    }
  }
}
```

On Linux/macOS the interpreter is `<repo>/tools/github-detector/.venv/bin/python`.

Smoke-test it before relying on it:

```bash
cd tools/github-detector && ./.venv/Scripts/python.exe scripts/mcp_smoke_test.py
```

The server advertises itself as `hiringmates-github-detector`; check
`meta.detector` in the response if you need to confirm which build answered.

## Tools

### `detect_github_profile` — primary

| Param | Type | Default | Notes |
|---|---|---|---|
| `handle` | string | **required** | Username, profile URL, `@handle`, `owner/repo`, or SSH remote. Normalised automatically; the rewrite is reported in `meta.handle_note`. |
| `loc_strategy` | `"tree"` \| `"languages"` \| `"clone"` | `"tree"` | Leave on `tree` unless told otherwise. |
| `top_n` | int | `10` | Repos to clone + deep-analyse. **`0` = metadata only, fast.** |
| `include_forks` | bool | `false` | Forks are excluded: not the author's own work. |
| `fetch_readmes` | bool | `false` | Adds README excerpts for the cloned shortlist. |
| `max_repos` | int | `300` | Upper bound on repos enumerated. |
| `resolve_ambiguous` | bool | `true` | Clone repos whose LOC estimate cannot safely decide the filter (~1 extra clone/profile). `false` keeps them on the estimate instead. |
| `max_resolve_clones` | int | `10` | Cap on repos cloned purely to settle an LOC verdict. Prevents a broad API outage from triggering a clone of every repo. |
| `save_profile` | bool | `false` | Write the full report to `data/profiles/<handle>.json`. Path echoed in `meta.profile_saved_to`. |

`loc_strategy` guidance:
- `tree` — estimates LOC from the file tree and also yields the full
  `structure` fingerprint. **Best default.**
- `languages` — cheapest, least accurate (bytes, includes vendored content).
  **Yields no `structure`** — there is no file listing to infer from.
- `clone` — clones *every* repo for exact LOC. Slow and bandwidth-heavy. Avoid
  on accounts with many repositories.

### What the tool infers, and what it leaves to you

The tool infers only what the **tree listing** supports — no cloning needed,
so these fields are populated for **every** repository, not just the cloned
shortlist:

`has_tests`, `has_ci`, `has_dockerfile`, `has_license`, `has_readme`,
`entry_point_hint`, `total_files`, `top_level`, `dir_file_counts`,
`largest_source_files`

These are computed from the complete recursive file listing, so nesting depth
is irrelevant — a Dockerfile at `infra/docker/prod/Dockerfile` is found just
as reliably as one at the root.

**Deliberately NOT attempted:** anything requiring file *contents* — code
quality, architecture, what a file actually does, whether tests are meaningful.
That is your job, not the tool's. The cloned shortlist gives you
`local_path`; read the code there yourself.

### `get_ranking_weights` — no arguments

Returns the weights and hard-filter thresholds. Call this first if you need to
**explain** or reproduce the ordering rather than just report it.

## Tags

`tags` gives you ready-to-attach labels for a candidate record, derived **only**
from data already fetched — language byte totals, repository topics, and the
structural fingerprint. **Zero extra API calls.**

| Field | Contents |
|---|---|
| `tags.all` | Flat list, ready to store as tags. Languages first, then skills. |
| `tags.languages` | Every language seen, with `bytes`, `share` of total code, and `repos` count. Nothing is hidden — languages below the 1% share floor appear here but are kept out of `tags.all` so they do not pollute it. |
| `tags.skills` | Inferred skills, each with `confidence` (`high`/`medium`) and the `evidence` that fired it. |

A skill fires when a structure flag ratio, repeated topic, or language share
crosses a threshold. **Confidence is `high` when two or more independent signals
agree**, `medium` on a single one. Topics require **2+ repositories** — a single
mention is weak evidence, so precision is preferred over recall.

Worked example (`tiangolo`):

```
languages : Python 85%, TypeScript 9%, JavaScript 2%, Shell 1.6%, Dockerfile 1.3%
skills    : backend, ci-cd, containerisation, github-automation,
            web-services  [high]  ·  testing, documentation,
            open-source-hygiene, async-programming  [medium]
```

### What tags are NOT

These are **signal aggregation, not code understanding.** They cannot tell you
which libraries a codebase uses, how it is architected, or how good it is —
that requires reading the code (RAG), which this tool deliberately does not do.
Treat a skill tag as evidence-backed, not as a verdict, and prefer `high`
confidence when ranking candidates. `tags.note` says the same thing
machine-readably.

When reporting, cite the evidence rather than the bare label — "containerisation
(Dockerfile in 65% of repos; `docker` topic ×6)" is defensible, "knows Docker"
is not.

## Persisting a profile

Pass `save_profile: true` to write the full report to
`data/profiles/<handle>.json` and have the path echoed in
`meta.profile_saved_to`. Off by default — the tool writes files only when asked.

Useful when you want a record to survive without re-running the tool, or when
comparing the same handle over time. Note that `data/` is gitignored, so saved
profiles are local only.

## Response shape

```jsonc
{
  "ok": true,
  "handle": "tiangolo",              // normalised
  "handle_input": "https://github.com/tiangolo",  // exactly what you passed
  "profile": { "login", "name", "bio", "company", "location", "blog",
               "email", "twitter_username", "account_type", "public_repos",
               "followers", "following", "created_at", "hireable" },
  "stats":   { "repos_total", "repos_ranked", "repos_dropped", "repos_cloned",
               "repos_unmeasured", "repos_ambiguous",
               "repos_resolved_by_clone", "repos_deferred_resolution",
               "total_loc_top_n", "total_loc_all", "total_stars",
               "languages": { "Python": 1195449, ... },
               "elapsed_seconds",
               "rate_limit": { "authenticated", "rest_consumed",
                               "rest_remaining", "rest_limit" } },
  "repositories": [ /* ranked, best first */ ],
  "cloned": [ { "name", "path", "loc", "files_counted" } ],
  "ambiguity_resolved": [ { "name", "loc", "kept", "resolved_by",
                            "drop_reason" } ],
  "warnings": [],               // degraded-but-usable conditions — READ THESE
  "tags": {                     // derived signals — see "Tags" below
    "all": ["Python", "TypeScript", "containerisation", "ci-cd", ...],
    "languages": [ { "name", "bytes", "share", "repos" } ],
    "skills":    [ { "name", "confidence", "evidence": [...] } ],
    "note": "…"
  },
  "errors": [],
  "meta": { "loc_strategy", "top_n_clone",      // NOT "top_n"
            "ranking_weights", "generated_at", "authenticated",
            "detector", "version", "resolve_ambiguous",
            "handle_note",          // present only when the handle was rewritten
            "loc_accuracy": { "estimated_count", "exact_count",
                              "bytes_per_line", "interval_rule", "note" } }
}
```

Each entry in `repositories`:

```jsonc
{
  "rank": 1, "name": "…", "full_name": "owner/repo",
  "description": "…", "url": "…", "homepage": "…", "topics": [],
  "primary_language": "Python", "languages": { "Python": 123456 },
  "stars": 3003, "forks": 210, "open_issues": 40,
  "commit_count": 433,          // default branch, authoritative
  "loc": 702, "loc_source": "clone",  // tree | languages | clone | unavailable
  "loc_range": [],              // [low, high] for ESTIMATES; empty when exact
  "loc_uncertain": false,       // true only mid-run; cleared once resolved
  "loc_resolved_by": "clone",   // "" | "clone" | "estimate" | "unavailable"
  "loc_measured": true,         // false => loc is UNKNOWN, not zero
  "loc_truncated": false,       // true => loc is a LOWER bound
  "loc_error": "",              // why measurement failed, when it did
  "files_counted": 13,
  "created_at": "…", "pushed_at": "…", "default_branch": "master",
  "is_fork": false, "is_archived": false, "has_readme": true,
  "score": 93.38, "kept": true, "drop_reason": "",
  "cloned": true, "local_path": "…",
  "structure": { "total_files", "top_level": [], "dir_file_counts": {},
                 "largest_source_files": [], "has_tests": true,
                 "has_ci": true, "has_dockerfile": true, "has_license": true,
                 "has_readme": true, "entry_point_hint": "…",
                 "tree_truncated": false }
}
```

## How ranking works

`score` is a **0–100 weighted sum of min-max normalised, log-scaled**
components:

| Component | Weight | Source |
|---|---|---|
| stars | 0.30 | `stargazerCount` |
| commits | 0.25 | commit count on default branch |
| loc | 0.20 | source lines (exact when cloned, estimated otherwise) |
| recency | 0.15 | exponential decay on `pushedAt`, 180-day half-life |
| forks | 0.10 | `forkCount` |

Weights are **relative to the account being analysed** — min-max normalisation
is computed within that one profile, so scores are not comparable across
different handles. Only compare `rank` within a single response.

### Accuracy of `loc` — estimate vs exact

`loc` is **an estimate, not an exact line count**, for any repository whose
`loc_source` is `"tree"` or `"languages"`. It is computed as
`total code bytes ÷ 35`.

**The error is not uniform between repositories.** The constant is applied
uniformly *per byte*, not per line, and effective bytes-per-line is
language-dependent. Measured across 13 real repos: **21.6 to 46.1 effective
bytes/line (2.14x spread)**, giving per-repo errors of **−40% to +32%**.
Markup-heavy repos sit at the low end — `Spoon-Knife` estimated 18 against an
exact 30 (**−40%**). Do not assume the bias cancels out between repos; it does
not.

**Why the ranking is still near-accurate: damping.** The LOC error is diluted
rather than removed:

- `loc` is only **0.20** of the score, against stars 0.30 and commits 0.25 —
  the two components that most drive ordering are untouched by the estimate.
- LOC enters **log-scaled**, compressing a 30% error into a small contribution.
- Scores are **min-max normalised within the profile**, so only the spread
  between repositories matters, not the absolute scale.

Practical rule:

| Field | Trust it? |
|---|---|
| `rank`, `score` | Yes — the ordering is sound |
| `loc` where `loc_source == "clone"` | Yes — exact line count |
| `loc` where `loc_source == "tree"` / `"languages"` | **Estimate** — good for comparison, not for quoting a precise figure. Carries its own error per repo |

`loc_range` carries the honest interval for each estimate
(`[loc/1.32, loc/0.60]` ≈ `[0.76x, 1.67x]`), and is empty for exact counts. If a
range straddles 1000, the filter verdict genuinely cannot be decided from the
estimate — that is precisely the case the tool resolves by cloning.

So report ordering confidently. If you state a specific LOC number, check
`loc_source` first, and prefer quoting the cloned top-N figures, which are
always exact.

**One consequence worth watching:** the hard filter compares `loc` against a
threshold, so a repo near 1000 LOC can be misclassified by the estimate alone.
Treat filter results near the boundary as approximate.

This caveat is also machine-readable: see `meta.loc_accuracy` in every
response, and the `get_ranking_weights` tool.

### Hard filters (repos removed from `repositories`)

- Nominal rule: `loc < 1000` **AND** `stars <= 100` → dropped
- **Exactly 100 stars does NOT qualify.** The rule is "more than 100".
- Archived repositories → always dropped
- Forks → dropped unless `include_forks=true`

**The estimate-only floor is 600, not 1000.** Since `loc` is an estimate for
non-cloned repos and can understate by ~40%, an estimate is only trusted to
*drop* a repo when even the worst case still lands below the threshold — i.e.
below **600**. Repositories estimated between **600 and 1000** with
`stars <= 100` are **ambiguous**: they are kept and flagged `loc_uncertain`,
then cloned so the verdict uses an exact count.

- `stats.repos_ambiguous` — how many hit the band
- `ambiguity_resolved[]` — `{name, loc, kept, resolved_by, drop_reason}` for each
- `resolved_by` is `"clone"` (exact verdict) or `"estimate"` (kept on the
  estimate, never silently dropped)
- A drop decided by an exact count is marked `(exact)` in `drop_reason`

Measured cost: about **one extra clone per profile** (1 of 44 repos for
`tiangolo`, 0 of 6 for `octocat`). Pass `resolve_ambiguous=false` to skip it —
ambiguous repos are then kept on the estimate.

`stats.repos_dropped` counts the drops. It is normal for this to be large —
most developers have many small repos.

### When a repository can't be measured

If the file listing can't be fetched (rate limit, network, 5xx), `loc` is
**UNKNOWN — not zero**. Such a repository is:

- **kept, never dropped** — missing data is not grounds for a drop
- flagged `loc_measured: false`, `loc_source: "unavailable"`, with `loc_error`
- counted in `stats.repos_unmeasured`
- announced in `warnings`

If the clone path still works — git does not use the REST API, so it often does
when the API is rate-limited — the tool recovers an exact LOC automatically and
resolves the verdict from that.

`max_resolve_clones` (default 10) caps how many repositories get cloned purely
to settle an LOC verdict, so a broad outage can't trigger cloning everything.
Anything past the cap is kept and reported in `stats.repos_deferred_resolution`.

**Always check `warnings`.** A non-empty `warnings` array means the report is
valid but degraded. An empty `errors` array does NOT mean every repository was
measured.

## Gotchas

1. **`loc` changes meaning after cloning.** Ranking uses the *estimated* LOC;
   then the top-N get cloned and `loc`/`loc_source` are overwritten with exact
   values. So a top-10 repo may show `loc_source: "clone"` while its `score`
   was computed from the estimate. This is by design — don't treat it as a bug.
2. **`commit_count` is per default branch**, not total across all branches.
3. **Rate limits are real and shared.** The `tree` strategy costs ~1 REST call
   per non-fork repo plus 1 for the profile (measured: 54 repos → 45 calls).
   Bucket is **5,000/hr authenticated, 60/hr anonymous**. Without a token,
   expect ~1 profile like that per hour. Always check `stats.rate_limit`.
4. **`top_n=10` clones can take minutes.** For an interactive turn, prefer
   `top_n=0` (metadata only, seconds) or `top_n=2-3`, then deep-dive on demand.
5. **Clones are cached** in `tools/github-detector/data/github_cache/<handle>/`
   and reused. A repeat call on the same handle is much faster. Safe to delete
   the cache; it is gitignored.
6. **An org handle fails.** The GraphQL query uses `user(login:)`. Orgs are not
   supported; expect an error rather than a partial result.
7. **Errors are returned, not raised.** Check `errors` and `ok` even on a
   nominal success — a run can partially succeed.
8. **Empty `repositories` is a valid answer** — it means everything was
   filtered out, not that the call failed. Cross-check `stats.repos_dropped`.
9. **HTML, CSS and template markup DO count as code.** `loc` includes
   `.html/.htm/.css/.scss/.sass/.less`, component files (`.vue/.svelte/.astro`)
   and template languages (`.ejs/.hbs/.pug/.twig/.erb/.jsp/.cshtml`). Data and
   assets do **not** count (`.json`, `.csv`, `.png`, `.svg`).
10. **Lockfiles, minified bundles, and vendored dirs are excluded** from `loc`
    (`node_modules`, `.venv`, `vendor`, `dist`, `package-lock.json`, `*.min.js`).
    A repo can therefore show a lower LOC than its raw byte size suggests.
    Caveat: generated documentation HTML committed into the repo (sphinx
    builds, coverage reports) *will* be counted, since only known build
    directories are skipped.
11. **`structure` is absent when `loc_strategy="languages"`.** Don't read an
    empty `structure` as "this repo has no tests" — switch to `tree`.
12. **`has_dockerfile` covers all three naming conventions at any depth:**
    `Dockerfile`, `Dockerfile.dev`, and `python3.11.dockerfile`, plus
    `docker-compose.yml` / `compose.yaml`.
13. **Handles are normalised, and the rewrite is reported.** `@octocat`,
    `https://github.com/octocat`, `octocat/repo`, and
    `git@github.com:octocat/repo.git` all resolve to `octocat`. Check
    `meta.handle_note` when present; `handle_input` always echoes what you
    passed. Unusable input (a GitHub path like `/orgs/foo`, or free text) is
    rejected **before** any network call, with a message saying what is expected.
14. **Don't re-implement the LOC filter.** The nominal threshold is 1000 but the
    estimate-only floor is 600; repos between them are cloned to decide. If you
    filter `repositories` yourself, use `loc` for a rough cut only and prefer
    `ambiguity_resolved[]` for anything near the boundary.
15. **Check `warnings`, and check `loc_measured`.** A repo with
    `loc_measured: false` has an UNKNOWN LOC — `loc` is 0 only because nothing
    was measured. Never report it as empty, and never filter it out. A non-empty
    `warnings` array means the report is degraded even though `errors` is empty.
16. **`tags` are derived signals, not analysis.** They come free from data
    already fetched and cost no API calls, but they cannot see inside the code.
    Cite the `evidence` rather than the bare label, and prefer `high` confidence.
    Absence of a skill tag means "no signal found", NOT "does not have the skill".
17. **`tags` reflect only the repositories that survived the filter.** A
    language used solely in small, unstarred repos will not appear. Treat the
    language list as "languages visible in their significant work".

## Worked examples

Fast triage (seconds, no cloning):
```json
{"handle": "octocat", "top_n": 0}
```

Standard profile (defaults — ranks everything, clones top 10):
```json
{"handle": "tiangolo"}
```

Deep dive on the top 3, with READMEs:
```json
{"handle": "tiangolo", "top_n": 3, "fetch_readmes": true}
```

Include forks (e.g. assessing maintained forks):
```json
{"handle": "someuser", "include_forks": true}
```

## Reporting results back

When summarising for a user:
- Lead with `profile.name`, `followers`, `stats.repos_total`.
- Cite `rank`, `stars`, `commit_count`, `loc`, `primary_language` per repo.
- State the filter explicitly: "38 of 54 repos were filtered out (under 1000
  LOC with ≤100 stars)" — otherwise a short list looks like missing data.
- Use `structure.has_tests` / `has_ci` / `has_dockerfile` for engineering
  maturity signals, and `structure.entry_point_hint` to say where to start reading.
- Mention `loc_source` if the user cares whether numbers are exact or estimated.

## Running the tests

```bash
cd tools/github-detector
pytest -q                                                          # offline
GITHUB_DETECTOR_LIVE=1 pytest tests/test_github.py::TestLiveGitHub  # live GitHub
```
