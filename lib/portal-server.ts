/**
 * Server-side helpers for the company & mentor portal.
 *
 * Portal routes run on the service-role client because they act on data the
 * caller does not own (a mentor reading another student's attempt, grading an
 * attempt whose answer key the student must not see). That means RLS is
 * bypassed, so EVERY route here must authorise the caller itself before
 * touching data — `portalActor()` is the door, and it is backed by the
 * hardcoded allowlist in `lib/portal.ts`.
 */

import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { companyForMentor, portalRoleFor } from '@/lib/portal'

// Typed loosely on purpose. The portal tables are new and not present in any
// generated Database type, so a strictly typed client resolves every row to
// `never`. Nothing is lost in practice: these routes bypass RLS, so they
// authorise the caller themselves via portalActor()/ownedPosition().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminClient: any

/**
 * Service-role client. Server-side only — never import this from a client
 * component, it bypasses RLS entirely.
 */
export function getSupabaseAdminClient() {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.',
      )
    }
    adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return adminClient
}

export interface PortalActor {
  userId: string
  email: string
  role: 'company' | 'mentor'
  /** The company this actor belongs to. Mentors are linked to the single company. */
  companyEmail: string
}

export interface StudentActor {
  userId: string
  email: string
}

/**
 * Resolves the authenticated user from either:
 *  1. An explicit Authorization: Bearer <token> header.
 *  2. The SSR session cookies.
 */
export async function getAuthenticatedUser(req?: Request) {
  // 1. Try Bearer token from header
  let authHeader = req?.headers.get('authorization')
  if (!authHeader) {
    try {
      const headerList = await headers()
      authHeader = headerList.get('authorization')
    } catch {
      // ignore
    }
  }

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) {
      try {
        const admin = getSupabaseAdminClient()
        const { data, error } = await admin.auth.getUser(token)
        if (!error && data.user) {
          return data.user
        }
      } catch {
        // fallback
      }
    }
  }

  // 2. Fall back to cookie-based session
  try {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase.auth.getUser()
    return data.user ?? null
  } catch {
    return null
  }
}

/**
 * Resolve the signed-in user, or null when nobody is signed in.
 * Used by the student-facing attempt routes, which are open to any account.
 */
export async function studentActor(req?: Request): Promise<StudentActor | null> {
  const user = await getAuthenticatedUser(req)
  if (!user?.email) return null
  return { userId: user.id, email: user.email.toLowerCase() }
}

/**
 * Resolve the signed-in user and confirm they are on the portal allowlist.
 *
 * Returns null when they are not signed in, not on the allowlist, or are on it
 * with the wrong role. Callers turn that into a 401/403.
 */
export async function portalActor(
  required?: 'company' | 'mentor',
  req?: Request,
): Promise<PortalActor | null> {
  const user = await getAuthenticatedUser(req)
  if (!user?.email) return null

  const email = user.email.toLowerCase()
  const role = portalRoleFor(email)
  if (!role) return null
  if (required && role !== required) return null

  const companyEmail =
    role === 'company' ? email : (companyForMentor(email) ?? '')

  return { userId: user.id, email, role, companyEmail }
}

/**
 * Confirm the signed-in company owns this position.
 * Returns the position row, or null when it does not exist or is not theirs.
 */
export async function ownedPosition(actor: PortalActor, positionId: string) {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('positions')
    .select('*')
    .eq('id', positionId)
    .maybeSingle()

  if (error || !data) return null
  if (String(data.owner_email).toLowerCase() !== actor.email) return null
  return data
}

/** Questions with the answer key removed — safe to send to a browser. */
export function stripAnswers(questions: any[]): any[] {
  return (questions ?? []).map((q) => {
    if (!q || typeof q !== 'object') return q
    const copy = { ...q }
    delete copy.correct_index
    return copy
  })
}
