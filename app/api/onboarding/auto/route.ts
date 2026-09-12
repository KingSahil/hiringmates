import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { backendUrl, buildIdentity } from '@/lib/backend'

/**
 * Auto-onboarding entry point: "first sign-in starts the assessment".
 *
 * Idempotent by construction — it is safe (and intended) to call this on every
 * sign-in and on every mount of the assessment view. A candidate counts as NEW
 * only when they have neither a durable profile nor any session row, so a
 * refresh, a second tab, or an abandoned signup can never start a second
 * pipeline run for the same account.
 *
 * The existence check reads `candidate_profiles` and `sessions` through the
 * user's own session, so RLS scopes it to their rows. If that check itself
 * fails we deliberately fail CLOSED rather than assume "new" — guessing here
 * would spawn duplicate extractions, which are slow and cost LLM calls.
 *
 * Responses:
 *   200 { status: 'existing',     sessionId, sessionStatus }  already registered
 *   202 { status: 'new',          sessionId, session }        pipeline started
 *   400 { status: 'not_eligible', missing }                   no GitHub identity
 *   401 not signed in
 *   500 the registration check itself failed (fail closed)
 *   502 backend rejected the request / 503 backend unreachable
 */
export async function POST() {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user ?? null

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // --- Has this account ever been registered? ------------------------------
  const [profileRes, sessionRes] = await Promise.all([
    supabase
      .from('candidate_profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .limit(1),
    supabase
      .from('sessions')
      .select('id, status')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1),
  ])

  // Fail closed: never guess "new" when the lookup is unreliable.
  if (profileRes.error || sessionRes.error) {
    return NextResponse.json(
      {
        error: 'registration_check_failed',
        detail: profileRes.error?.message ?? sessionRes.error?.message,
      },
      { status: 500 },
    )
  }

  const latest = sessionRes.data?.[0] ?? null
  const isNew = !profileRes.data?.length && !latest

  if (!isNew) {
    return NextResponse.json(
      {
        status: 'existing',
        sessionId: latest?.id ?? null,
        sessionStatus: latest?.status ?? null,
      },
      { status: 200 },
    )
  }

  // --- New candidate: the pipeline needs a GitHub identity to profile -----
  const { data: sessionData } = await supabase.auth.getSession()
  const { identity, missing } = buildIdentity(user, sessionData?.session)

  if (missing.length > 0) {
    return NextResponse.json(
      {
        status: 'not_eligible',
        message:
          'Automatic onboarding profiles your GitHub account, so a GitHub identity is required.',
        missing,
      },
      { status: 400 },
    )
  }

  // Creating the session is what starts the LLM work: the backend returns 202
  // immediately and runs extraction -> rough profile -> questions in the
  // background. The frontend polls until the status reaches "awaiting".
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
        { status: 'backend_error', detail: payload },
        { status: 502 },
      )
    }

    return NextResponse.json(
      { status: 'new', sessionId: payload.id, session: payload },
      { status: 202 },
    )
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'backend_unreachable', detail },
      { status: 503 },
    )
  }
}
