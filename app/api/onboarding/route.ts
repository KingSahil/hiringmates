import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { backendUrl, buildIdentity } from '@/lib/backend'

/**
 * Onboarding bridge.
 *
 *   POST  -> create a session on the Python backend (202) and return its id
 *   GET   -> poll a session: GET /api/onboarding?id=<session_id>
 *
 * The backend does the slow work (GitHub extraction) asynchronously, so POST
 * returns immediately and the client polls GET until status is "awaiting"
 * (questions ready) or "complete".
 */

async function currentUser() {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data.user ?? null }
}

function backendFailure(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)
  return NextResponse.json(
    {
      error: 'backend_unreachable',
      message: `Could not reach the RAG backend. Is it running at ${process.env.BACKEND_BASE_URL ?? '(unset)'}?`,
      detail,
    },
    { status: 503 },
  )
}

export async function POST() {
  const { user } = await currentUser()
  if (!user) {
    return NextResponse.json(
      { error: 'not_authenticated', message: 'Sign in before starting onboarding.' },
      { status: 401 },
    )
  }

  const supabase = await getSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const { identity, missing } = buildIdentity(user, sessionData?.session)

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: 'incomplete_identity',
        message:
          'Onboarding needs both a GitHub and a Google account linked. The extraction cache is keyed on both emails.',
        missing,
      },
      { status: 400 },
    )
  }

  try {
    const res = await fetch(`${backendUrl()}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity, scenario: 'candidate-onboarding' }),
      cache: 'no-store',
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: 'backend_error', message: 'Backend rejected the request.', detail: payload },
        { status: 502 },
      )
    }
    return NextResponse.json(payload, { status: 202 })
  } catch (error) {
    return backendFailure(error)
  }
}

export async function GET(request: Request) {
  const { user } = await currentUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json(
      { error: 'missing_id', message: 'Pass ?id=<session_id>.' },
      { status: 400 },
    )
  }

  try {
    const res = await fetch(`${backendUrl()}/sessions/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(payload, { status: res.status })
    }
    return NextResponse.json(payload)
  } catch (error) {
    return backendFailure(error)
  }
}
