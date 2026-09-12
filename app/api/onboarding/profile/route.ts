import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { backendUrl } from '@/lib/backend'

/**
 * Fetch the caller's saved enhanced profile.
 *
 * This is what makes the profile durable: the backend keeps it beyond the
 * extraction cache TTL, and a returning candidate sees it instead of being
 * silently asked to start over.
 *
 * Returns 204 when there is no profile yet, so the client can show "Start"
 * without treating it as an error.
 */
export async function GET() {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  try {
    const res = await fetch(
      `${backendUrl()}/profiles/${encodeURIComponent(user.id)}`,
      { cache: 'no-store' },
    )

    if (res.status === 404) {
      return new NextResponse(null, { status: 204 })
    }

    const payload = await res.json().catch(() => ({}))
    return NextResponse.json(payload, { status: res.status })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        error: 'backend_unreachable',
        message: 'Could not reach the RAG backend.',
        detail,
      },
      { status: 503 },
    )
  }
}
