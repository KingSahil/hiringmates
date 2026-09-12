# RAG backend

Multi-scenario pipeline that turns a GitHub profile into an assessed candidate
profile. Currently one scenario: `candidate-onboarding`.

```
POST /sessions              create -> 202, status "pending"
GET  /sessions/{id}         poll until "awaiting" (questions ready)
POST /sessions/{id}/answers submit -> grades -> "complete"
GET  /profiles/{user_id}    fetch the finished profile
GET  /health                liveness + config problems
```

Extraction is slow (roughly 5-28s by repository count), so creation returns
immediately and the work runs in the background. Poll; do not block.

## Layout

| Path | Role |
|---|---|
| `rag/models.py` | Domain models. `Identity` is supplied by auth, never derived here. |
| `rag/scenarios.py` | Scenario registry. Adding a scenario is adding an entry. |
| `rag/llm.py` | `LLMClient` interface + Gemini and fake implementations. |
| `rag/store.py` | `Store` interface + in-memory and Supabase implementations. |
| `rag/pipeline.py` | The stage machine. |
| `rag/config.py` | Env-driven settings. |
| `api.py` | HTTP surface (needs the `api` extra). |

## Run

```bash
pip install -e ".[api,dev]"
cp .env.example .env    # fill in GEMINI_API_KEY and Supabase service role
uvicorn api:app --reload
```

Tests need no credentials:

```bash
pytest -q
```

## Design notes

**Deterministic where possible.** MCQ answers are known, so they are scored in
code. Only profiling, question generation, and the one theory answer go to the
model. This keeps the high-variance, expensive step as small as possible.

**Timing is server-recorded.** `served_at` is stamped when questions go out and
elapsed time is computed on receipt. A client-supplied duration would be
trivially faked.

**Two lifetimes, not one.** `EXTRACTION_TTL_DAYS` (30) gates *re-extraction*.
Enhanced profiles persist beyond it — they are the expensive artifact.

**Anti-repeat is retrieval, not seeding.** A seed does not prevent cheating;
question reuse does. Previously served prompts are passed to the model and it
is told to avoid them. Later this becomes a pgvector similarity check.

**Auth is out of scope here.** The backend trusts the `Identity` it is given.
When Supabase auth lands in front of this service it produces that object.

## Wiring auth (for whoever builds it)

`app/auth/callback/route.ts` already calls `exchangeCodeForSession`, so the
server half is in place. The missing piece is **initiation** — nothing currently
calls `signInWithOAuth`, so no `code` ever reaches that route.

Once OAuth is initiated, map the Supabase session onto `Identity`:

| `Identity` field | Source |
|---|---|
| `user_id` | `session.user.id` |
| `github_handle` | identity with `provider === 'github'` → `identity_data.user_name` |
| `github_email` | same identity → `identity_data.email` |
| `google_email` | identity with `provider === 'google'` → `identity_data.email` |
| `provider_token` | `session.provider_token` |

Notes that matter:

- **Both emails are required**, because the extraction cache is keyed on the
  pair. That means the user must have *both* GitHub and Google linked before
  onboarding completes; otherwise the cache key is partial and never hits.
- **`provider_token` is only present for the provider just used**, and is not
  persisted across sessions. Store it encrypted server-side if you want
  post-TTL re-extraction to avoid the anonymous 60 req/hr cap.
- Call `POST /sessions` from a **server** context (route handler or server
  action), never the browser — it carries the service-role path and the token.

```jsonc
POST /sessions
{
  "identity": {
    "user_id": "...",
    "github_email": "...",
    "google_email": "...",
    "github_handle": "...",
    "provider_token": "..."
  },
  "scenario": "candidate-onboarding"
}
```

Then poll `GET /sessions/{id}` until `status` is `awaiting`.

## Not verified in this environment

- Gemini calls (no API key present)
- Supabase reads/writes (no service-role key present)
- `api.py` at runtime (`fastapi` not installed)

The pipeline, cache, scoring and timing logic are covered by 26 tests that run
without any credentials.
