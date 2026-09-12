import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase-server'
import { backendUrl } from '@/lib/backend'

/**
 * Submit assessment answers.
 *
 * Body: { session_id: string, answers: [{ question_id, selected_index?, text? }] }
 *
 * The backend grades MCQs deterministically in code and sends only the one
 * theory answer to the model. Elapsed time for the theory question is measured
 * server-side by the backend, so the client cannot influence it.
 */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  let body: { session_id?: string; answers?: unknown[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const sessionId = body.session_id
  if (!sessionId || !Array.isArray(body.answers)) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'session_id and answers[] are required.' },
      { status: 400 },
    )
  }

  try {
    const res = await fetch(
      `${backendUrl()}/sessions/${encodeURIComponent(sessionId)}/answers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: body.answers }),
        cache: 'no-store',
      },
    )
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
