# hiringmates

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_oy8SN1OeRdIpikNV8H0JgXqQ9hRA)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

---

# GitHub Detector

`tools/github-detector` is a local **MCP server** that profiles a GitHub account
and returns a ranked repository report to a calling AI agent. It is independent
of the Next.js app — its own Python package, dependencies, and tests.

## What it returns

Given a username, it enumerates every owned repository and returns:

- the **public profile** — name, bio, company, location, followers, account age
- every repository **ranked 0–100** on stars, commit count, lines of code,
  recency, and forks
- a **structural fingerprint** per repository — tests, CI, Dockerfile, license,
  entry point, largest source files — inferred from the GitHub file listing, so
  it is available for *every* repository without cloning
- the top-N repositories **shallow-cloned to disk** with exact line counts and a
  `local_path` the agent can read

Repositories under 1,000 lines of code are dropped unless starred by more than
100 users. Archived repositories are always dropped; forks are excluded by
default.

## Setup

```bash
cd tools/github-detector
python -m venv .venv
.venv/Scripts/activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
cp .env.example .env
```

Then set `GITHUB_TOKEN` in `.env`. **Strongly recommended:** anonymous GitHub
access is capped at 60 requests/hour — roughly **one profile per hour**, because
the line-counting pass costs about one request per repository. A token raises
that to 5,000/hour.

A classic token needs no scopes for public data; a fine-grained token needs
"Public Repositories (read-only)".

## Connecting an AI agent

The server speaks MCP over stdio. Add it to your MCP client config:

```json
{
  "mcpServers": {
    "github-detector": {
      "command": "<repo>/tools/github-detector/.venv/Scripts/python.exe",
      "args": ["-m", "app.mcp_server"],
      "cwd": "<repo>/tools/github-detector"
    }
  }
}
```

`cwd` must point at the tool root — the server imports from the `app` package
and resolves its clone cache relative to that directory. On macOS/Linux the
interpreter is `.venv/bin/python`.

Verify the wiring end to end before relying on it:

```bash
python scripts/mcp_smoke_test.py
```

## Tools

| Tool | Purpose |
|---|---|
| `detect_github_profile` | Primary. Profile, ranked repositories, cloned shortlist. |
| `get_ranking_weights` | Ranking weights and hard-filter thresholds, for explaining an ordering. |

Key parameters of `detect_github_profile`:

| Parameter | Default | Notes |
|---|---|---|
| `handle` | required | Username, profile URL, `@handle`, `owner/repo`, or SSH remote — normalised automatically |
| `top_n` | `10` | Repositories to clone and deep-analyse. **`0` = metadata only, fast** |
| `loc_strategy` | `"tree"` | Leave on `tree` unless you have a specific reason |
| `include_forks` | `false` | Forks are not the author's own work |
| `max_repos` | `300` | Upper bound on repositories enumerated |

## Notes worth knowing

- **`loc` is an estimate, not an exact count**, for any repository that was not
  cloned. It is code bytes ÷ 35, and the error is language-dependent — measured
  between −40% and +32%. The ranking stays reliable because the LOC error is
  *damped* (20% of the score, log-scaled, min-max normalised), not because it
  cancels out. Check `loc_source`: `"clone"` means exact.
- **Always check `warnings`.** A repository whose file listing could not be
  fetched reports `loc_measured: false` and an *unknown* LOC — it is kept rather
  than dropped. An empty `errors` array does **not** mean every repository was
  measured.
- The tool is read-only against GitHub. Clones land in
  `tools/github-detector/data/`, which is gitignored.

## Tests

```bash
pytest -q                                                          # offline
GITHUB_DETECTOR_LIVE=1 pytest tests/test_github.py::TestLiveGitHub  # live GitHub
```

