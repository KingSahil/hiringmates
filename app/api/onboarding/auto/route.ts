import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseAdminClient } from '@/lib/portal-server'
import { backendUrl, buildIdentity } from '@/lib/backend'
import { portalRoleFor } from '@/lib/portal'

/**
 * Auto-onboarding entry point:
 *
 * If cache or profile already exists for this GitHub account within 30 days:
 *   Returns 200 { status: 'cached', hasCache: true } -> NO NEED FOR ASSESSMENT.
 *
 * If brand-new candidate with NO cache in 30 days:
 *   Starts the assessment pipeline (202).
 */
export async function POST() {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user ?? null

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // Portal members (company / mentors) do not take candidate onboarding.
  if (portalRoleFor(user.email)) {
    return NextResponse.json(
      { status: 'portal_member', message: 'Company and mentor accounts are exempt from candidate onboarding.' },
      { status: 200 },
    )
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const { identity, missing } = buildIdentity(user, sessionData?.session)

  if (missing.length > 0) {
    return NextResponse.json(
      {
        status: 'not_eligible',
        message: 'Automatic onboarding profiles your GitHub account, so a GitHub identity is required.',
        missing,
      },
      { status: 400 },
    )
  }

  const admin = getSupabaseAdminClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const cacheKey = `github:${identity.github_email.trim().toLowerCase()}`
  const handle = identity.github_handle.trim().toLowerCase()

  // 1. Check if candidate profile already exists
  // 2. Check if a completed session already exists
  // 3. Check if extraction cache exists for this GitHub account within 30 days
  const [profileRes, completedSessionRes, extractionRes, latestSessionRes] = await Promise.all([
    admin
      .from('candidate_profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .limit(1),
    admin
      .from('sessions')
      .select('id, status, payload')
      .eq('user_id', user.id)
      .eq('status', 'complete')
      .limit(1),
    admin
      .from('extractions')
      .select('cache_key, handle, created_at')
      .or(`cache_key.eq.${cacheKey},handle.ilike.${handle}`)
      .gte('created_at', thirtyDaysAgo)
      .limit(1),
    admin
      .from('sessions')
      .select('id, status, payload')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  const hasProfile = (profileRes.data?.length ?? 0) > 0
  const hasCompletedSession = (completedSessionRes.data?.length ?? 0) > 0
  const hasFreshExtractionCache = (extractionRes.data?.length ?? 0) > 0

  // If cache or profile is already made up for this GitHub account (TTL 30 days):
  // NO NEED FOR ASSESSMENT!
  if (hasProfile || hasCompletedSession || hasFreshExtractionCache) {
    return NextResponse.json(
      {
        status: 'cached',
        hasCache: true,
        message: 'GitHub account already profiled and cached within 30-day TTL. No assessment needed.',
        sessionId: latestSessionRes.data?.[0]?.id ?? null,
        sessionStatus: latestSessionRes.data?.[0]?.status ?? 'complete',
      },
      { status: 200 },
    )
  }

  // Also check if they already have an existing in-flight session
  const latestSession = latestSessionRes.data?.[0] ?? null
  if (latestSession && ['pending', 'extracting', 'awaiting'].includes(latestSession.status)) {
    return NextResponse.json(
      {
        status: 'existing',
        sessionId: latestSession.id,
        sessionStatus: latestSession.status,
      },
      { status: 200 },
    )
  }

  // Brand-new account with NO cache in 30 days -> start the pipeline
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
