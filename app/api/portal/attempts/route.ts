import { NextResponse } from 'next/server'
import { backendUrl } from '@/lib/backend'
import {
  getSupabaseAdminClient,
  stripAnswers,
  studentActor,
} from '@/lib/portal-server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** Fisher-Yates — used to randomise the manual pool per attempt. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Start a round-1 attempt on a position.
 *
 * Returns the questions with the answer key removed. The full set — including
 * `correct_index` — is stored on the attempt row, which RLS hides from the
 * student until it has been graded, so the key cannot be read mid-attempt.
 */
export async function POST(request: Request) {
  const actor = await studentActor()
  if (!actor) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const positionId = String(body.position_id ?? '')
  if (!positionId) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'position_id is required.' },
      { status: 400 },
    )
  }

  const admin = getSupabaseAdminClient()
  const { data: position } = await admin
    .from('positions')
    .select('*')
    .eq('id', positionId)
    .maybeSingle()

  if (!position) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  let questions: any[] = []

  if (position.question_mode === 'manual') {
    const { data: pool } = await admin
      .from('position_questions')
      .select('*')
      .eq('position_id', positionId)

    if (!pool || pool.length === 0) {
      return NextResponse.json(
        {
          error: 'empty_pool',
          message: 'This position has no manual questions yet.',
        },
        { status: 409 },
      )
    }
    // Same pool, different order every attempt.
    questions = shuffle(pool)
  } else {
    // Auto: a fresh set generated from the role brief on every attempt.
    try {
      const targetUrl = `${backendUrl()}/positions/questions`
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: position.role,
          description: position.description,
          tags: position.tags,
          // Internal flag: we need the key to grade later. It is stored
          // server-side and never forwarded to the browser.
          include_answers: true,
        }),
        cache: 'no-store',
      })

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}))
        return NextResponse.json(
          {
            error: 'backend_error',
            message: 'Question generation failed.',
            detail: errorPayload,
          },
          { status: 502 },
        )
      }
      const payload = await res.json()
      questions = payload.questions ?? []
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error('Failed to reach RAG backend for position questions:', err)
      return NextResponse.json(
        {
          error: 'backend_unreachable',
          message: `Could not reach RAG backend at ${process.env.BACKEND_BASE_URL ?? '(unset)'}.`,
          detail,
        },
        { status: 503 },
      )
    }
  }

  if (!questions.length) {
    return NextResponse.json(
      { error: 'no_questions', message: 'No questions could be produced.' },
      { status: 502 },
    )
  }

  const { data: attempt, error } = await admin
    .from('position_attempts')
    .insert({
      position_id: positionId,
      user_id: actor.userId,
      questions,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { attempt_id: attempt.id, questions: stripAnswers(questions) },
    { status: 201 },
  )
}
