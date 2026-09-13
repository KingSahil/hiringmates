import { NextResponse } from 'next/server'
import { getSupabaseAdminClient, studentActor } from '@/lib/portal-server'

interface SubmittedAnswer {
  question_id?: string
  selected_index?: number | null
  text?: string
}

/**
 * Grade a round-1 attempt.
 *
 * Grading is server-side against the answer key stored on the attempt — the
 * client's answers are the only thing trusted from the request body.
 *
 * Only the multiple-choice questions drive the score: they have one
 * unambiguous right answer. Theory questions are not auto-gradable here, and
 * only decide the outcome when a position has no MCQs at all.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await studentActor()
  if (!actor) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { id } = await params

  let body: { answers?: SubmittedAnswer[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const admin = getSupabaseAdminClient()
  const { data: attempt, error: readError } = await admin
    .from('position_attempts')
    .select('*')
    .eq('id', id)
    .eq('user_id', actor.userId)
    .maybeSingle()

  if (readError || !attempt) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  if (attempt.passed !== null) {
    return NextResponse.json(
      { error: 'already_graded', score: attempt.score, passed: attempt.passed },
      { status: 409 },
    )
  }

  const { data: position } = await admin
    .from('positions')
    .select('pass_threshold')
    .eq('id', attempt.position_id)
    .maybeSingle()

  const threshold = Number(position?.pass_threshold ?? 60)

  const questions: any[] = attempt.questions ?? []
  const answers = body.answers ?? []
  const byId = new Map<string, SubmittedAnswer>()
  for (const a of answers) {
    if (a?.question_id) byId.set(String(a.question_id), a)
  }

  const mcqs = questions.filter((q) => q?.kind === 'mcq')
  const theories = questions.filter((q) => q?.kind === 'theory')

  let correct = 0
  for (const q of mcqs) {
    const given = byId.get(String(q.id))?.selected_index
    if (given !== undefined && given !== null && Number(given) === Number(q.correct_index)) {
      correct += 1
    }
  }

  let score: number | null
  let passed: boolean

  if (mcqs.length > 0) {
    score = Math.round((correct / mcqs.length) * 100)
    passed = score >= threshold
  } else {
    // No objective questions: fall back to "did they actually answer".
    const answered = theories.some((q) => {
      const text = byId.get(String(q.id))?.text
      return typeof text === 'string' && text.trim().length > 0
    })
    score = null
    passed = answered
  }

  const { error: updateError } = await admin
    .from('position_attempts')
    .update({ score, passed, answers })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ score, passed, threshold })
}
