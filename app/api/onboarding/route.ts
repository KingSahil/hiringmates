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

export async function POST(request?: Request) {
  let body: any = {}
  if (request) {
    body = await request.json().catch(() => ({}))
  }
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

  if (body?.github_handle) {
    identity.github_handle = String(body.github_handle)
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/\/+$/, '')
  }
  if (!identity.github_email && user?.email) {
    identity.github_email = user.email
  }

  const effectiveMissing: string[] = []
  if (!identity.user_id) effectiveMissing.push('user id')
  if (!identity.github_email) effectiveMissing.push('GitHub account (email)')
  if (!identity.github_handle) effectiveMissing.push('GitHub handle')

  if (effectiveMissing.length > 0) {
    return NextResponse.json(
      {
        error: 'incomplete_identity',
        message:
          'Onboarding needs a GitHub account or handle to analyze. Please provide your GitHub profile.',
        missing: effectiveMissing,
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
