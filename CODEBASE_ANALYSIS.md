# HiringMates — Codebase Analysis

**Date:** 2026-09-13
**Scope:** Full repo `@ C:\GitRepos\hiringmates` (frontend Next.js app, Python RAG backend, `tools/github-detector` MCP server).
**Method:** Static read of source, config, migrations, and tests. No runtime execution (backend deps not installed in this env).

---

## 1. What this is

HiringMates is a developer-assessment / hiring platform: candidates sign in (GitHub / LinkedIn), the system profiles their GitHub via an external detector, an LLM generated a tailored technical-questions session, and they complete a proctored coding assessment. There is also a live **multiplayer coding arcade** (shared Monaco editor with Realtime presence) and a **mentorship** video/room flow.

Three deployable units:
| Unit | Stack | Entry | Status |
|---|---|---|---|
| Next.js frontend | Next 16.3.3 (App Router), React 19, Tailwind v4, Supabase JS | `next dev` / `app/` | Build-runable; TS errors suppressed (see §5) |
| Python RAG backend | FastAPI + Pydantic v2, Gemini/OpenAI/Anthropic, Supabase Postgres | `uvicorn api:app` | Fully written, **not runnable here** (fastapi/uvicorn absent) |
| github-detector | Python MCP server (stdio) | `python -m app.mcp_server` | Self-contained, documented, tested |

---

## 2. Architecture

```
Browser (React client)
  ├─ AuthProvider (Supabase browser client)        lib/auth.tsx, lib/supabase.ts
  ├─ NavigationProvider (hash-less history tabs)    lib/navigation.tsx
  ├─ NotificationProvider (mock + Realtime)          lib/notifications.tsx
  └─ AppShell -> tab views (home/codemates/mentorship/assessment/hireme)
        │  fetch('/api/...')
        ▼
Next.js Route Handlers (server-only)               app/api/**
  ├─ bridge to RAG backend (BACKEND_BASE_URL, no NEXT_PUBLIC)   lib/backend.ts
  └─ use service-role key for admin tasks (demo account)
        │  http
        ▼
Python FastAPI backend (api.py)                    backend/api.py
  ├─ Pipeline (extraction -> profile -> questions)  backend/rag/pipeline.py
  ├─ LLM (Gemini default)                            backend/rag/llm.py
  ├─ Store: MemoryStore | SupabaseStore             backend/rag/store.py
  └─ Plagiarism engine (CopyDetect)                 backend/rag/plagiarism.py
        │  subprocess
        ▼
tools/github-detector (detect_cli.py)  ->  GitHub API
```

**Backend bridge design (good):** `BACKEND_BASE_URL` is server-side only (no `NEXT_PUBLIC_`) and the provider token is forwarded from the server, never the browser. The RAG backend is stateless re: auth — it trusts an `Identity` object supplied by the Next.js server, which is the correct seam.

**Graceful degradation (good):** the plagiarism route (`app/api/plagiarism/check/route.ts`) tries the Python backend and **falls back to an isomorphic TypeScript engine** (`lib/proctoring/antiCheatEngine.ts`, Codeforces winnowing). Assessment works even if the backend is down.

---

## 3. Feature map

| Route / tab | File | Real backend? | Notes |
|---|---|---|---|
| Landing / home | `components/views/LandingContent.tsx` | n/a | Marketing + FAQ; references "CodeMates", "HireMe.app" |
| Onboarding + assessment | `components/views/AssessmentContent.tsx` | Yes (`/api/onboarding*`) | Polls session; submits answers; profile fetch |
| HireMe (proctoring) | `components/views/HireMeContent.tsx` | Yes (`/api/plagiarism/check`) | Eye-tracking (`lib/proctoring/eyeTracker.ts`), environment shield, keystroke flight recorder |
| CodeMates (multiplayer) | `components/views/CodeMatesContent.tsx` | Realtime only | Supabase channels/presence; Monaco editor |
| Mentorship | `components/views/MentorshipMeetContent.tsx` | Realtime only | Supabase broadcast; hardcoded demo notification data |
| Auth | `components/views/AuthContent.tsx`, `app/auth/*` | GitHub + LinkedIn OAuth | `app/multiplayer.tsx` also has an auth page (dead, see §4) |

**Notifications are mock data:** `lib/notifications.tsx` ships two hardcoded notifications (Sarah Vance / Maya Chen) but is wired to a Supabase Realtime broadcast channel (`hiringmates-round2-alerts`). The real-time plumbing is real; the seed content is demo.

---

## 4. Dead / orphaned code

- **`app/multiplayer.tsx`** — A complete multiplayer module (`AuthPage`, `RealRooms`, `RealLobby`, `MultiplayerGame` with Supabase Realtime) of ~150 lines. **Nothing imports it.** The live multiplayer is implemented separately in `components/views/CodeMatesContent.tsx`. This file is duplicate/legacy and should be deleted or merged — it will rot and confuse.
- **Naming drift:** the app is "HiringMates" but UI strings say "HireMe.app" and "CodeMates". Pick one brand before launch.

---

## 5. Issues & risks (by severity)

### 🔴 High
1. **Missing DB schema for realtime/multiplayer features.** The committed migrations (`backend/migrations/001_init.sql`, `002_extraction_source.sql`) create only `extractions`, `sessions`, `candidate_profiles`, `served_questions`. The frontend, however, queries `rooms`, `room_members`, `messages`, `submissions`, and `profiles(display_name)` (in `CodeMatesContent`, `MentorshipMeetContent`, and the dead `app/multiplayer.tsx`). Against a fresh Supabase these fail with relation-not-found / RLS errors. **There is no migration for the entire multiplayer + profiles schema.** This is the single biggest functional gap.
2. **`typescript.ignoreBuildErrors: true`** in `next.config.mjs`. The production build silently passes type errors. For a strict-TS (`tsconfig.json` `strict: true`) codebase this hides real bugs in CI. Re-enable and fix errors, or you are shipping blind.

### 🟠 Medium
3. **Backend not runnable / unverified in this environment.** `api.py` itself states fastapi/uvicorn are "not installed… written but unverified at runtime." The backend `api.py` also notes pipeline auth is "NOT implemented" (trusts caller Identity). Fine behind the Next.js server, but the backend is not independently hardened.
4. **`onboarding/route.ts` error message is wrong.** It returns 400 with *"Onboarding needs both a GitHub and a Google account linked"*, but `lib/backend.ts buildIdentity()` only requires `user_id`, `github_email`, `github_handle` — Google is intentionally optional. The message misleads operators debugging a 400. Also, the cache key is `github_email|google_email`; if Google is never linked the key still works, but the doc comment in the route contradicts the code.
5. **`demo-account/route.ts` exposes an admin capability** via a public `POST`: it uses `SUPABASE_SERVICE_ROLE_KEY` to create/list users. It's server-side only (no `NEXT_PUBLIC_` leak) so the key is safe, but it's an unauthenticated endpoint that can provision/overwrite a demo user. Add an auth gate or rate limit.

### 🟡 Low
6. **No middleware / route protection.** `app/auth/callback` and API routes check sessions, but there is no `middleware.ts` enforcing auth at the edge. Relying on per-route checks is fine but easy to forget on new routes.
7. **Hardcoded demo values** in `notifications.tsx` and the `MultiplayerGame` default code — acceptable for a demo build, flag for production.
8. **`lucide-react` version `^1.16.0`** looks anomalous (lucide-react is normally `0.x`); confirm this resolves to the intended package and isn't a typo / squat.
9. **`@base-ui/react`** is used for UI primitives but `shadcn` is also a dependency — unused/dead dependency or WIP migration. `components/ui/button.tsx` exists (shadcn-style) while views use `@base-ui`. Consolidate.

---

## 6. Security posture (mostly good)

- ✅ `.env` is gitignored (verified `git check-ignore backend/.env` → ignored; only `.env.example` files tracked). The `.gitignore` even documents *why* `.env` is listed explicitly.
- ✅ Service-role key is server-only; never prefixed `NEXT_PUBLIC_`.
- ✅ Backend uses service-role with RLS enabled on user tables + defence-in-depth policies; migration comment correctly notes tenant isolation must also be enforced in the service layer.
- ⚠️ See §5.5 (demo-account admin endpoint) and §5.3 (backend has no own auth).

---

## 7. Backend quality notes (positive)

- Clean provider abstraction (`GeminiLLM` / `OpenAICompatLLM` / `AnthropicCompatLLM` / `FakeLLM`), no SDK imports at module scope → degrades to clear errors instead of crashes.
- `Store` ABC with `MemoryStore` (tests) + `SupabaseStore` (prod), lazy Supabase import.
- Singleton pipeline with a documented bug-fix comment (per-request store was being discarded → 404s). Good institutional memory.
- Tests present: `backend/tests/{test_llm,test_pipeline,test_plagiarism}.py` (offline via `FakeLLM`); `tools/github-detector/tests/{test_github,test_mcp_server}.py`. Run `pytest -q`.

---

## 8. Recommended next steps

1. **Write the missing Supabase migrations** for `profiles`, `rooms`, `room_members`, `messages`, `submissions` (RLS + service-role as in 001_init.sql) — or confirm an uncommitted migration exists and commit it. This unblocks the entire multiplayer/mentorship surface.
2. **Delete or merge `app/multiplayer.tsx`** (dead code duplicating `CodeMatesContent`).
3. **Turn off `ignoreBuildErrors`** and fix the resulting TS errors before relying on `next build`.
4. **Reconcile the onboarding 400 message** with `buildIdentity` (Google is optional).
5. **Gate `demo-account`** behind auth/rate-limit.
6. **Verify `lucide-react`/`shadcn`/`@base-ui`** deps and consolidate UI primitives.
7. **Run backend tests** (`pytest -q` in `backend/` and `tools/github-detector/`) and the MCP smoke test to confirm green before claiming the pipeline works.

---

*Generated by static analysis. No files were modified. Runtime claims (backend liveliness, test pass/fail) were not executed because the Python environment has FastAPI/uvicorn absent and no Supabase credentials are present.*
