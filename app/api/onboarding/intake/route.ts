import { NextResponse } from 'next/server'
import { backendUrl } from '@/lib/backend'

/**
 * Capture the candidate's intake form answers.

 * The form is shown while extraction and profiling run in the background, so
 * this can land before or after the questions are generated. It is stored on the
 * session and folded into the question-generation context if it has arrived by
 * then. Safe to submit more than once — later submissions overwrite earlier ones.
 */
export async function POST(request: Request) {
  let body: { session_id?: string; answers?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (!body.session_id || !body.answers) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'session_id and answers are required.' },
      { status: 400 },
    )
  }

  try {
    const res = await fetch(
      `${backendUrl()}/sessions/${encodeURIComponent(body.session_id)}/intake`,
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
      { error: 'backend_unreachable', detail },
      { status: 503 },
    )
  }
}
